/**
 * Shared "create-or-update Assessment scores" flow — used by BOTH 6.2's
 * blocker-statement generation (`actions/assessment.ts`) and 6.3's waterfall
 * verdict generation (`actions/waterfall.ts`), and read (not written) by
 * 6.4's document generation (`actions/documents.ts`), which needs an already-
 * scored `Assessment` to generate documents against. Extracted here instead
 * of being duplicated three times, the same reasoning 2.8's architect review
 * applied to `toScoringInput` itself (task 6.0a).
 *
 * ---------------------------------------------------------------------------
 * Design call: why does 6.2 create/update the Assessment row BEFORE running
 * generation, not after?
 * ---------------------------------------------------------------------------
 *
 * The carve-verifier agent's contract (`agents/carve-verifier.agent.yaml`)
 * is: "You are given ... the assessment id ... Call
 * get_verification_facts(assessmentId, ...) to fetch the ground-truth
 * numbers." That tool call needs a REAL, already-persisted `Assessment` row
 * to look up — it cannot verify a blocker statement's cited scores/facts
 * against an assessment that doesn't exist in the database yet. So the six
 * scores + `blockerDimension` + `retailerDataVersion` (all deterministic,
 * computed with no AI call) must be persisted BEFORE `generateWithVerification`
 * runs, not after — otherwise the verifier's very first tool call would fail
 * on every single blocker-statement generation, degenerating the retry state
 * machine to always `needs_review`.
 *
 * `Assessment.blockerStatement` is a NOT NULL `String` column, though, and it
 * is exactly the field the AI call is generating — it cannot be known at the
 * moment this function runs. Resolved with a two-phase write, mirrored by
 * both callers:
 *
 *   1. This function creates (or updates) the `Assessment` row with every
 *      deterministic field, using `BLOCKER_STATEMENT_PENDING` (`""`, an empty
 *      string) as an explicit sentinel for "not yet generated" the first time
 *      a row is created for this brand+retailer pair. On an UPDATE (a row
 *      already exists — e.g. the founder re-ran scoring after changing an
 *      intake answer), the existing `blockerStatement` is left untouched by
 *      this function; only the six scores/`blockerDimension`/
 *      `retailerDataVersion` are refreshed. A real, previously-generated
 *      blocker statement is never silently reset back to the pending
 *      sentinel just because scores were recomputed.
 *   2. The calling Server Action runs `generateWithVerification` against this
 *      now-real `assessment.id`, and only OVERWRITES `blockerStatement` with
 *      the generated text if the result is `final`. On `needs_review`, the
 *      field is left exactly as this function set it (either the pending
 *      sentinel, on a fresh Assessment, or an untouched prior value, on an
 *      update) — never assigned the flagged, unverified text.
 *
 * An empty string is never a valid real blocker statement (the generator
 * always writes founder-facing prose), so it's an unambiguous, DB-native
 * sentinel — no extra nullable column or status enum needed for this. A
 * later UI task (7.2/7.4) should treat `blockerStatement === ""` as "still
 * generating / needs review," not render it as empty content.
 *
 * ---------------------------------------------------------------------------
 * Design call (RESOLVED): `@@unique([brandId, retailerId])` on `Assessment`
 * ---------------------------------------------------------------------------
 *
 * This function originally implemented "one assessment per brand+retailer
 * pair" at the application level only (`findFirst` then `create`/`update`),
 * flagging both a real race-condition gap (a concurrent double-submit could
 * create two rows for the same pair) and task 1.0's still-open product
 * question (does v1 support only one active assessment per brand at all, or
 * per-retailer?).
 *
 * Both are now resolved: `prisma/schema.prisma` has `@@unique([brandId,
 * retailerId])` on `Assessment` — one *current* assessment per retailer a
 * brand has been scored against (supporting multi-retailer pursuit, per
 * FR-06/US-09), but not an unbounded history per retailer (re-scoring
 * upserts in place, same "single blocker at a time" simplicity as FR-03).
 * This function now uses a real, atomic `db.assessment.upsert(...)` instead
 * of the racy findFirst-then-branch — Postgres itself enforces the
 * invariant, not application logic.
 */

import type { Prisma, Retailer } from "@prisma/client";
import {
  getRetailerDataVersion,
  scoreDimensionsSafe,
  toScoringInput,
  type BrandScoringFacts,
} from "@/lib/scoring/map-retailer-requirements";
import { computeOverallScore } from "@/lib/scoring/dimensions";
import { selectBlocker, type BlockerResult } from "@/lib/scoring/blocker";
import type { DimensionScores } from "@/lib/scoring/types";

/** See file header — the explicit "not yet generated" sentinel for the NOT
 * NULL `Assessment.blockerStatement` column. */
export const BLOCKER_STATEMENT_PENDING = "";

/** Prisma's generated `Assessment` model type, referenced structurally below
 * so this file doesn't need to redeclare its shape. */
export type PersistedAssessment = Awaited<
  ReturnType<Prisma.TransactionClient["assessment"]["create"]>
>;

export interface AssessmentScoresResult {
  assessment: PersistedAssessment;
  dimensions: DimensionScores;
  blocker: BlockerResult;
  overallScore: number;
  /** True if this call created a brand-new Assessment row (blockerStatement
   * is the pending sentinel); false if an existing row's scores were
   * refreshed (blockerStatement is whatever it already was). */
  created: boolean;
}

/**
 * `db` is typed as `Prisma.TransactionClient` (not the full `PrismaClient`)
 * because both callers (6.2, 6.3) invoke this from inside their own
 * `prisma.$transaction(async (tx) => ...)` — see each action file's header
 * for why. The real `prisma` singleton is structurally assignable here too
 * (a `PrismaClient` has every method `Prisma.TransactionClient` requires,
 * plus a few this type omits), so this same function also works if a future
 * caller ever needs to run it outside a transaction.
 */
export async function upsertAssessmentScores(
  db: Prisma.TransactionClient,
  brand: BrandScoringFacts,
  retailer: Retailer,
): Promise<AssessmentScoresResult> {
  const scoringInput = toScoringInput(brand, retailer);
  const dimensions = scoreDimensionsSafe(scoringInput);
  const overallScore = computeOverallScore(dimensions);
  const blocker = selectBlocker(dimensions);
  const retailerDataVersion = getRetailerDataVersion(retailer);

  const scoreFields = {
    overallScore,
    marginScore: dimensions.margin.score,
    distributorScore: dimensions.distributor.score,
    certificationScore: dimensions.certification.score,
    timingScore: dimensions.timing.score,
    velocityScore: dimensions.velocity.score,
    fulfillmentScore: dimensions.fulfillment.score,
    blockerDimension: blocker.dimension,
    retailerDataVersion,
  };

  // Informational only — NOT what enforces the one-row-per-pair invariant
  // (the `upsert()` below, backed by the `@@unique([brandId, retailerId])`
  // constraint, does that atomically). A concurrent request between this
  // read and the upsert could make `created` report the wrong boolean to
  // this particular caller, but the actual row count/data is still correct
  // either way — this field only drives caller-side UX (e.g. "first score"
  // vs. "re-scored" messaging), not data integrity.
  const existing = await db.assessment.findUnique({
    where: { brandId_retailerId: { brandId: brand.id, retailerId: retailer.id } },
  });

  const assessment = await db.assessment.upsert({
    where: { brandId_retailerId: { brandId: brand.id, retailerId: retailer.id } },
    update: scoreFields, // blockerStatement deliberately untouched.
    create: {
      brandId: brand.id,
      retailerId: retailer.id,
      blockerStatement: BLOCKER_STATEMENT_PENDING,
      ...scoreFields,
    },
  });

  return { assessment, dimensions, blocker, overallScore, created: !existing };
}
