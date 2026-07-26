/**
 * Shared UI-facing display state for any generated-text surface (blocker
 * statement, waterfall verdict, and — reusable by task 7.4, built
 * separately — each of the 6 FR-05 document types). One shape, derived the
 * same way everywhere: prefer the persisted final text when it exists (a
 * non-empty NOT NULL column is only ever set on a `final` result — see
 * `lib/assessment/persist.ts` / `actions/waterfall.ts`'s "two-phase write"
 * headers), and fall back to `getLatestGenerationStatus`
 * (`lib/generation-status/get-latest-status.ts`, task 7.0b) only to
 * disambiguate "never attempted" from "needs review" from "failed" when the
 * persisted column is still its pending sentinel.
 */

export type GenerationDisplayState =
  | { kind: "final"; text: string }
  | { kind: "needs_review"; discrepancy: string }
  | { kind: "not_started" }
  | { kind: "failed" };
