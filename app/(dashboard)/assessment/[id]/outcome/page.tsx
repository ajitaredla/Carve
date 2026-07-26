import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCurrentBrand } from "@/lib/auth/current-brand";
import type { OutcomeStatus } from "@/actions/outcomes";
import { OutcomeForm } from "@/components/outcomes/outcome-form";
import { OutcomeHistory } from "@/components/outcomes/outcome-history";

/**
 * Task 7.6 — Outcome logging UI (US-15, FR-07). Reachable from the
 * assessment detail view (7.2's "Log outcome" link).
 *
 * Scoped to one assessment's route (`/assessment/[id]/outcome`) rather than
 * a single top-level form, so `assessmentId` (and `retailerId`) are passed
 * to `logOutcome` EXPLICITLY, straight from this page's own route param —
 * per this task's brief, not relying on `logOutcome`'s own brand+retailer
 * auto-resolution fallback (`actions/outcomes.ts`'s 6.8 fix), since this
 * page already has the real id in hand.
 *
 * If outcomes already exist for this brand+retailer pair, they're shown
 * above the form as history (oldest logged-result context first, matching
 * `OutcomeHistory`'s own newest-first ordering) — a founder who has already
 * logged a "pending" result and comes back to log "won" once the PO
 * actually lands can see the prior entry, not just the new form.
 */
export default async function OutcomePage({
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
  // RLS, so this is the real isolation boundary) — a 404, not a 403.
  if (!assessment || assessment.brandId !== brand.id) {
    notFound();
  }

  const outcomes = await prisma.outcome.findMany({
    where: { brandId: brand.id, retailerId: assessment.retailerId },
    orderBy: { loggedAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">
            Brand home
          </Link>{" "}
          /{" "}
          <Link
            href={`/assessment/${assessment.id}`}
            className="hover:text-foreground"
          >
            {assessment.retailer.name}
          </Link>{" "}
          / Log outcome
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Log your result — {assessment.retailer.name}
        </h1>
      </div>

      {outcomes.length > 0 ? (
        <OutcomeHistory
          outcomes={outcomes.map((outcome) => ({
            id: outcome.id,
            status: outcome.status as OutcomeStatus,
            notes: outcome.notes,
            loggedAt: outcome.loggedAt,
          }))}
        />
      ) : null}

      <OutcomeForm
        retailerId={assessment.retailerId}
        assessmentId={assessment.id}
        retailerName={assessment.retailer.name}
      />
    </div>
  );
}
