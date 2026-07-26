/**
 * Task 7.5 — Not-ready redirect state (FR-06).
 *
 * "If readiness score falls below 40/100 for target retailer, Carve
 * explicitly states the brand is not ready and recommends an alternative
 * stepping-stone retailer." Shown as a distinct state ALONGSIDE the blocker
 * statement on the assessment detail view (not a separate route — see
 * `app/(dashboard)/assessment/[id]/page.tsx`), gated on `lib/assessment/
 * not-ready.ts`'s shared threshold helper.
 *
 * Deliberately does NOT name a specific alternative retailer — no
 * stepping-stone-recommendation engine exists anywhere in this codebase (no
 * retailer-tiering/sizing data model). Per the task brief, a clear, honest
 * message referencing the blocker dimension is the correct v1 scope, not an
 * invented recommendation.
 */

import { DIMENSION_LABELS } from "@/lib/scoring/dimension-labels";
import type { DimensionKey } from "@/lib/scoring/types";

export function NotReadyBanner({
  overallScore,
  retailerName,
  blockerDimension,
}: {
  overallScore: number;
  retailerName: string;
  blockerDimension: DimensionKey;
}) {
  const dimensionLabel = DIMENSION_LABELS[blockerDimension];

  return (
    <div className="space-y-2 rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-5">
      <p className="text-xs font-semibold tracking-wide text-destructive uppercase">
        Not ready for {retailerName} yet
      </p>
      <p className="font-display text-lg font-semibold">
        Your readiness score is {overallScore}/100 — below the 40/100 bar
        Carve uses to flag a retailer as a stretch right now.
      </p>
      <p className="text-sm text-muted-foreground">
        Your biggest gap is <strong className="text-foreground">{dimensionLabel}</strong>.
        Rather than pursuing {retailerName} immediately, consider building
        traction with a smaller regional or specialty retailer first — one
        with lighter requirements on that dimension — then revisit{" "}
        {retailerName} once your score improves.
      </p>
    </div>
  );
}
