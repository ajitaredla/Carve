import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentFounderAndBrand } from "@/lib/auth/current-brand";
import { Button } from "@/components/ui/button";
import type { OutcomeStatus } from "@/actions/outcomes";
import { OutcomeHistory } from "@/components/outcomes/outcome-history";

/**
 * Task 7.6 — brand-wide outcome index, reachable from the top nav's
 * "Outcomes" link (`components/nav.tsx`, task 1.0's scaffold — that link
 * pointed at this exact route from the start, but no page existed here
 * until now; wiring it up closes an existing dead link, not a new one).
 *
 * Outcome LOGGING itself stays scoped per-assessment
 * (`/assessment/[id]/outcome`, this task's main deliverable) since
 * `logOutcome` needs a specific retailerId/assessmentId to log against —
 * this page is a read-only rollup of every outcome logged across every
 * retailer a brand has pursued (per 6.6b's multi-retailer support), plus
 * quick links into each assessment's own log-outcome page.
 */
export default async function OutcomesIndexPage() {
  const founder = await getCurrentFounderAndBrand();

  if (!founder || !founder.brand) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          No brand yet
        </h1>
        <p className="text-muted-foreground">
          Set up your brand and run your first assessment before logging an
          outcome.
        </p>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          render={<Link href="/assessment/new">Get started</Link>}
        />
      </div>
    );
  }

  const brand = founder.brand;

  const [assessments, outcomes] = await Promise.all([
    prisma.assessment.findMany({
      where: { brandId: brand.id },
      include: { retailer: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.outcome.findMany({
      where: { brandId: brand.id },
      include: { retailer: true },
      orderBy: { loggedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Outcomes
        </h1>
        <p className="text-muted-foreground">
          Every result you&apos;ve logged across retailers, plus where to log
          a new one.
        </p>
      </div>

      {outcomes.length > 0 ? (
        <OutcomeHistory
          outcomes={outcomes.map((outcome) => ({
            id: outcome.id,
            status: outcome.status as OutcomeStatus,
            notes: outcome.notes,
            loggedAt: outcome.loggedAt,
            retailerName: outcome.retailer.name,
          }))}
        />
      ) : (
        <p className="text-muted-foreground">No outcomes logged yet.</p>
      )}

      {assessments.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">Log a result</h2>
          <div className="flex flex-wrap gap-2">
            {assessments.map((assessment) => (
              <Button
                key={assessment.id}
                variant="outline"
                size="sm"
                render={<Link href={`/assessment/${assessment.id}/outcome`} />}
              >
                {assessment.retailer.name}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">
          No assessments yet —{" "}
          <Link href="/assessment/new" className="underline">
            add a retailer
          </Link>{" "}
          to get started.
        </p>
      )}
    </div>
  );
}
