import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCurrentBrand } from "@/lib/auth/current-brand";
import { getLatestGenerationStatus } from "@/lib/generation-status/get-latest-status";
import { calculateWaterfall } from "@/lib/waterfall/calculator";
import type { WaterfallResult } from "@/lib/waterfall/types";
import type { GenerationDisplayState } from "@/lib/generation-status/display-state";
import { WaterfallForm } from "@/components/waterfall/waterfall-form";
import { WaterfallResults } from "@/components/waterfall/waterfall-results";

/**
 * Task 7.3 — Waterfall calculator view (US-02). Reachable from 7.2's
 * assessment detail view ("Cost waterfall" button).
 *
 * `CostWaterfall` only persists the 7 scalar inputs + `founderMarginPct` —
 * no `moneyFlow`/`economics` columns exist (per 3.7's architect review, the
 * documented intended design: recompute-on-read, not a gap). This page is
 * the "read" side of that design: every render calls `calculateWaterfall()`
 * fresh on whatever scalars are currently persisted, so `moneyFlow`/
 * `economics` are always derived from the SAME numbers a founder just
 * submitted, never a stale cached copy.
 *
 * `needs_review` reconstruction mirrors 7.2's assessment detail page exactly
 * (see that file's header for the full reasoning) — `CostWaterfall.
 * verdictStatement` is authoritative once non-empty (the two-phase-write
 * sentinel, `actions/waterfall.ts`'s `VERDICT_STATEMENT_PENDING`); only when
 * empty does `getLatestGenerationStatus` (keyed by `costWaterfallId`, the
 * MORE specific key for this surface per that helper's own doc comment) get
 * consulted to disambiguate not-started / needs-review / failed.
 */
export default async function WaterfallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const brand = await requireCurrentBrand();

  const assessment = await prisma.assessment.findUnique({
    where: { id },
    include: { retailer: true, costWaterfall: true },
  });

  if (!assessment || assessment.brandId !== brand.id) {
    notFound();
  }

  const costWaterfall = assessment.costWaterfall;

  let result: WaterfallResult | null = null;
  let verdictDisplay: GenerationDisplayState = { kind: "not_started" };

  if (costWaterfall) {
    result = calculateWaterfall({
      factoryCost: costWaterfall.factoryCost.toNumber(),
      coPackingFee: costWaterfall.coPackingFee.toNumber(),
      freightToDc: costWaterfall.freightToDc.toNumber(),
      distributorMarkupPct: costWaterfall.distributorMarkupPct.toNumber(),
      retailerMarginPct: costWaterfall.retailerMarginPct.toNumber(),
      chargebackEstimate: costWaterfall.chargebackEstimate.toNumber(),
      msrp: costWaterfall.msrp.toNumber(),
    });

    if (costWaterfall.verdictStatement) {
      verdictDisplay = { kind: "final", text: costWaterfall.verdictStatement };
    } else {
      const status = await getLatestGenerationStatus(prisma, {
        surface: "waterfall_verdict",
        costWaterfallId: costWaterfall.id,
      });
      if (status.status === "needs_review") {
        verdictDisplay = {
          kind: "needs_review",
          discrepancy: status.discrepancy,
        };
      } else if (status.status === "failed") {
        verdictDisplay = { kind: "failed" };
      }
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Brand home
          </Link>{" "}
          /{" "}
          <Link
            href={`/assessment/${assessment.id}`}
            className="hover:text-foreground"
          >
            {assessment.retailer.name}
          </Link>{" "}
          / Cost waterfall
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Cost waterfall — {assessment.retailer.name}
        </h1>
      </div>

      {result ? (
        <WaterfallResults result={result} verdictDisplay={verdictDisplay} />
      ) : (
        <p className="text-muted-foreground">
          Enter your cost inputs below to calculate your first waterfall.
        </p>
      )}

      <WaterfallForm
        retailerSlug={assessment.retailer.slug}
        initialValues={
          costWaterfall
            ? {
                factoryCost: costWaterfall.factoryCost.toNumber(),
                coPackingFee: costWaterfall.coPackingFee.toNumber(),
                freightToDc: costWaterfall.freightToDc.toNumber(),
                distributorMarkupPct:
                  costWaterfall.distributorMarkupPct.toNumber(),
                chargebackEstimate: costWaterfall.chargebackEstimate.toNumber(),
                msrp: costWaterfall.msrp.toNumber(),
              }
            : null
        }
        hasExistingResult={Boolean(costWaterfall)}
      />
    </div>
  );
}
