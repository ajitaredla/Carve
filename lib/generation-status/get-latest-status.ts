/**
 * Task 7.0b — durable `needs_review` reconstruction (per 6.9's architect
 * review, task 6.0's final reviewer pass).
 *
 * The problem: `Assessment.blockerStatement` / `CostWaterfall.verdictStatement`
 * are NOT NULL string columns that only ever get overwritten on a `final`
 * `generateWithVerification` result (see `actions/assessment.ts` /
 * `actions/waterfall.ts`'s "two-phase write" file-header comments). On a
 * `needs_review` outcome, that column is deliberately left untouched — either
 * the pending sentinel (`lib/assessment/persist.ts`'s
 * `BLOCKER_STATEMENT_PENDING`, `actions/waterfall.ts`'s
 * `VERDICT_STATEMENT_PENDING`) on a first-ever attempt, or a STALE prior
 * value on a re-run. From a plain `SELECT` against `Assessment`/
 * `CostWaterfall` alone, "needs_review" is indistinguishable from "generation
 * was never attempted" (pending sentinel) or, worse, silently shows old
 * content as if it were current (stale value case) — a founder who triggers
 * a re-generation, gets flagged, and refreshes the page would see either a
 * blank/pending state or the PREVIOUS (possibly now-outdated) statement,
 * with no sign anything is wrong.
 *
 * Only `GenerationLog.output` / `verificationResult` actually preserves what
 * happened (see `lib/agents/generate.ts`'s file header for the exact
 * `verificationResult` semantics this helper decodes: "pass" | "flagged" |
 * "regenerated" | "failed", one row per AI call, never one row per
 * generation cycle).
 *
 * This helper answers, from a fresh page load (no live Server Action return
 * value available — that's a same-request-only concern 7.2/7.3/7.4 already
 * have to handle themselves), "what does the persisted history say the
 * current state of THIS surface, for THIS resource, actually is?" It is a
 * pure read — it never writes, and never assumes it's called in the same
 * request as the generation that produced what it's reading.
 *
 * ---------------------------------------------------------------------------
 * A note on why this can't just take "the last row" naively
 * ---------------------------------------------------------------------------
 *
 * Every row `persistGenerationLogs` writes for one `generateWithVerification`
 * run is written via sequential `db.generationLog.create()` calls INSIDE ONE
 * `prisma.$transaction(...)` (see `actions/assessment.ts` /
 * `actions/waterfall.ts` / `actions/documents.ts`). Postgres's `now()` /
 * `CURRENT_TIMESTAMP` — what `@default(now())` compiles to — is frozen at
 * the START of a transaction and returns the SAME value for every statement
 * inside it. That means every `GenerationLog` row from a single run (2 rows
 * on a clean pass, 4 rows on a flagged-then-retried run) can share an
 * IDENTICAL `createdAt`, so `createdAt` cannot be used to recover the
 * insertion order of rows WITHIN one run. It CAN reliably separate one run
 * from an entirely different, later run for the same surface+resource
 * (those happen in different requests/transactions, normally at least
 * seconds apart) — this helper uses it exactly that way: to find "the most
 * recent run" (the max-`createdAt` cluster), never to order rows inside it.
 * See `resolveOutcomeFromBatch` below for how the outcome is decoded WITHOUT
 * relying on intra-batch order.
 */

import type { GenerationSurface } from "@/lib/agents/generate";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export type GenerationStatus =
  | { status: "not_started" }
  | { status: "pass"; output: string }
  | { status: "needs_review"; discrepancy: string }
  | { status: "failed" };

// ---------------------------------------------------------------------------
// Structural Prisma dependency — same pattern as `lib/agents/generate.ts`'s
// `GenerationLogWriter`: anything with a `.generationLog.findMany(...)` of
// this shape qualifies (the real `prisma` singleton, a `tx`, or a bare test
// mock), without pulling in the full Prisma Client surface just to read
// three columns.
// ---------------------------------------------------------------------------

export interface GenerationLogStatusRow {
  createdAt: Date;
  output: string;
  verificationResult: string;
}

export interface GenerationLogReader {
  generationLog: {
    findMany(args: {
      where: {
        surface: string;
        assessmentId?: string;
        costWaterfallId?: string;
      };
      orderBy: { createdAt: "desc" };
      select: { createdAt: true; output: true; verificationResult: true };
    }): Promise<GenerationLogStatusRow[]>;
  };
}

export interface GetLatestGenerationStatusParams {
  surface: GenerationSurface;
  /** Exactly ONE of `assessmentId` / `costWaterfallId` must be given — pass
   * whichever id this surface's `GenerationLog` rows are actually linked by.
   * Per `lib/agents/generate.ts`'s callers: `blocker_statement` and every
   * document-type surface link by `assessmentId` only; `waterfall_verdict`
   * links by BOTH (`costWaterfallId` is the more specific key for that
   * surface — pass that one, not `assessmentId`, to avoid ever matching a
   * different `waterfall_verdict` run for the same assessment, e.g. if a
   * `CostWaterfall` row were ever recreated). */
  assessmentId?: string;
  costWaterfallId?: string;
}

// ---------------------------------------------------------------------------
// Row-shape discriminators — see `lib/agents/generate.ts`'s
// `GenerationLogEntry` construction (`buildEntry`) for exactly which
// (output, verificationResult) pairs each kind of row can have.
// ---------------------------------------------------------------------------

const VERIFIER_PASS_OUTPUT = "PASS";
const FLAGGED_OUTPUT_PREFIX = "FLAGGED: ";

/** A GENERATOR (or follow-up-correction) row whose text passed verification
 * and became the persisted final content — never a verifier's own "PASS"
 * literal, which is a different row with the same `verificationResult`. */
function isContentPassRow(row: GenerationLogStatusRow): boolean {
  return row.verificationResult === "pass" && row.output !== VERIFIER_PASS_OUTPUT;
}

/** A VERIFIER row reporting its own flagged verdict. */
function isFlaggedVerifierRow(row: GenerationLogStatusRow): boolean {
  return (
    row.verificationResult === "flagged" &&
    row.output.startsWith(FLAGGED_OUTPUT_PREFIX)
  );
}

/**
 * Decodes one run's outcome from its full set of rows, WITHOUT relying on
 * their relative order (see file header). A well-formed run (i.e. one that
 * actually went through `generateWithVerification`) always contains exactly
 * one of: a content-pass row (-> "pass"), or one-or-two flagged-verifier
 * rows (-> "needs_review"). Anything else is treated as "failed" — an
 * anomalous/incomplete log shape this helper doesn't recognize, rather than
 * silently guessing.
 */
function resolveOutcomeFromBatch(
  batch: GenerationLogStatusRow[],
): GenerationStatus {
  const contentPassRow = batch.find(isContentPassRow);
  if (contentPassRow) {
    return { status: "pass", output: contentPassRow.output };
  }

  const flaggedRows = batch.filter(isFlaggedVerifierRow);
  if (flaggedRows.length > 0) {
    // A flagged-then-regenerated-then-flagged-again run produces TWO flagged
    // verifier rows sharing the same frozen `createdAt` (see file header) —
    // there is no reliable per-row signal to distinguish "the first flag"
    // from "the final flag" once that's happened. Both are real,
    // this-exact-run discrepancy messages from the verifier; preferring the
    // last one in the query's own return order is a reasonable default, and
    // is cosmetic (which of two true messages is shown) rather than a
    // correctness gap — the `needs_review` status itself is unambiguous
    // either way, which is the part 7.2/7.3/7.4 actually branch on.
    const chosen = flaggedRows[flaggedRows.length - 1];
    return {
      status: "needs_review",
      discrepancy: chosen.output.slice(FLAGGED_OUTPUT_PREFIX.length),
    };
  }

  return { status: "failed" };
}

// ---------------------------------------------------------------------------
// getLatestGenerationStatus
// ---------------------------------------------------------------------------

/**
 * Reconstructs the current, durable state of ONE generation surface for ONE
 * resource (an `Assessment` or `CostWaterfall`), straight from
 * `GenerationLog` — safe to call on every fresh page load (7.2/7.3/7.4),
 * independent of whatever a live Server Action call returned in a prior
 * request. Returns `{status: "not_started"}` when no `GenerationLog` row
 * exists yet for this surface+resource at all (a founder who has never
 * triggered this generation).
 *
 * Note on what this DOESN'T cover: a session-level failure
 * (`AgentSessionError` — network drop, `retries_exhausted`, etc.) writes
 * ZERO `GenerationLog` rows (6.7's QC finding, accepted as a known v1
 * tradeoff — see `lib/agents/generate.ts`'s file header). If the founder's
 * most recent attempt was a session-level failure, this helper has no way to
 * know that happened — it will correctly report whatever the LAST
 * successfully-logged run says (e.g. "pass" from an earlier successful
 * generation, or "not_started" if there was never a completed run at all).
 * That's the right behavior for "what does the durable record say" — surfacing
 * "your last click failed" is a same-request, live-return-value concern for
 * the calling Server Action / UI, not something a page-load query can ever
 * reconstruct after the fact.
 */
export async function getLatestGenerationStatus(
  db: GenerationLogReader,
  params: GetLatestGenerationStatusParams,
): Promise<GenerationStatus> {
  if (!params.assessmentId && !params.costWaterfallId) {
    throw new Error(
      "getLatestGenerationStatus requires either assessmentId or costWaterfallId.",
    );
  }
  if (params.assessmentId && params.costWaterfallId) {
    throw new Error(
      "getLatestGenerationStatus takes only ONE of assessmentId / " +
        "costWaterfallId, not both — pass whichever id this surface's " +
        "GenerationLog rows are actually linked by (see this file's " +
        "GetLatestGenerationStatusParams doc comment).",
    );
  }

  const rows = await db.generationLog.findMany({
    where: {
      surface: params.surface,
      ...(params.assessmentId
        ? { assessmentId: params.assessmentId }
        : { costWaterfallId: params.costWaterfallId }),
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, output: true, verificationResult: true },
  });

  if (rows.length === 0) {
    return { status: "not_started" };
  }

  // The latest run = every row sharing the maximum createdAt (see file
  // header for why createdAt alone can't order rows WITHIN one run, but
  // reliably separates it from an older, different run).
  const latestCreatedAt = rows[0]!.createdAt.getTime();
  const latestBatch = rows.filter(
    (row) => row.createdAt.getTime() === latestCreatedAt,
  );

  return resolveOutcomeFromBatch(latestBatch);
}
