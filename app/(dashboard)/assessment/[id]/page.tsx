import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCurrentBrand } from "@/lib/auth/current-brand";
import { getLatestGenerationStatus } from "@/lib/generation-status/get-latest-status";
import { ScorePanel } from "@/components/assessment/score-panel";
import {
  BlockerPanel,
  type BlockerDisplayState,
} from "@/components/assessment/blocker-panel";
import { NotReadyBanner } from "@/components/assessment/not-ready-banner";
import { Button } from "@/components/ui/button";
import { DIMENSION_LABELS } from "@/lib/scoring/dimension-labels";
import type { DimensionKey } from "@/lib/scoring/types";
import { isNotReadyForRetailer } from "@/lib/assessment/not-ready";

/**
 * Task 7.2/7.5 — assessment detail view: the 6 dimension scores, overall
 * score, the single blocker statement (US-01, US-04), and — per FR-06/7.5 —
 * a distinct "not ready yet" state when `overallScore < 40`.
 *
 * `needs_review` reconstruction (per 7.0b's decision and 6.9's architect
 * review): `Assessment.blockerStatement` is only ever non-empty once a
 * `final` generation has actually happened (see `lib/assessment/persist.ts` /
 * `actions/assessment.ts`'s "two-phase write" headers) — so a non-empty
 * value is authoritative on its own. Only when it's still the pending
 * sentinel (`""`) do we need `getLatestGenerationStatus` to disambiguate
 * "never attempted" from "needs review" from "failed," which a plain
 * `SELECT` can't tell apart (this is exactly the gap 7.0a/7.0b closed).
 * `overallScore` always comes straight from the `Assessment` row itself,
 * never from a generation result — `generateBlockerStatement`'s
 * `needs_review` shape doesn't include it (6.9's architect review), but it's
 * deterministic and already persisted regardless of blocker-statement
 * generation outcome.
 */
export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const brand = await requireCurrentBrand();

  const assessment = await prisma.assessment.findUnique({
    where: { id },
    include: { retailer: true },
  });

  // Ownership check (lib/auth/current-brand.ts's convention: Prisma bypasses
  // RLS, so this is the real isolation boundary) — a 404, not a 403, so this
  // doesn't confirm to a caller whether the id exists at all.
  if (!assessment || assessment.brandId !== brand.id) {
    notFound();
  }

  const blockerDimension = assessment.blockerDimension as DimensionKey;
  const dimensionLabel = DIMENSION_LABELS[blockerDimension];

  let blockerDisplay: BlockerDisplayState;
  if (assessment.blockerStatement) {
    blockerDisplay = { kind: "final", text: assessment.blockerStatement };
  } else {
    const status = await getLatestGenerationStatus(prisma, {
      surface: "blocker_statement",
      assessmentId: assessment.id,
    });
    if (status.status === "needs_review") {
      blockerDisplay = {
        kind: "needs_review",
        discrepancy: status.discrepancy,
      };
    } else if (status.status === "failed") {
      blockerDisplay = { kind: "failed" };
    } else {
      blockerDisplay = { kind: "not_started" };
    }
  }

  const notReady = isNotReadyForRetailer(assessment.overallScore);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Brand home
            </Link>{" "}
            / {assessment.retailer.name}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {assessment.retailer.name}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            render={<Link href={`/assessment/${assessment.id}/waterfall`} />}
          >
            Cost waterfall
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/assessment/${assessment.id}/documents`} />}
          >
            Documents
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/assessment/${assessment.id}/outcome`} />}
          >
            Log outcome
          </Button>
        </div>
      </div>

      {notReady ? (
        <NotReadyBanner
          overallScore={assessment.overallScore}
          retailerName={assessment.retailer.name}
          blockerDimension={blockerDimension}
        />
      ) : null}

      <ScorePanel
        scores={{
          overallScore: assessment.overallScore,
          marginScore: assessment.marginScore,
          distributorScore: assessment.distributorScore,
          certificationScore: assessment.certificationScore,
          timingScore: assessment.timingScore,
          velocityScore: assessment.velocityScore,
          fulfillmentScore: assessment.fulfillmentScore,
          blockerDimension: assessment.blockerDimension,
        }}
      />

      <BlockerPanel
        retailerSlug={assessment.retailer.slug}
        initialDisplay={blockerDisplay}
        blockerDimensionLabel={dimensionLabel}
      />
    </div>
  );
}
