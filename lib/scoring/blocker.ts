/**
 * FR-03: Single Blocker Surfacing.
 *
 * "After scoring, Carve surfaces exactly one blocker — the highest-priority
 * gap. Never two." This module implements the selection of which single
 * dimension that is, given the six scored dimensions.
 */

import {
  DIMENSION_ORDER,
  DIMENSION_WEIGHTS,
  type CertificationFacts,
  type DimensionKey,
  type DimensionScores,
  type DistributorFacts,
  type FulfillmentFacts,
  type MarginFacts,
  type TimingFacts,
  type VelocityFacts,
} from "./types";

/**
 * The surfaced blocker, typed as a discriminated union on `dimension` so a
 * later task (the founder-facing blocker statement generator) gets the
 * correctly-shaped `facts` for whichever dimension won without a manual cast.
 */
export type BlockerResult =
  | {
      dimension: "margin";
      score: number;
      weight: number;
      reason: string;
      facts: MarginFacts;
    }
  | {
      dimension: "distributor";
      score: number;
      weight: number;
      reason: string;
      facts: DistributorFacts;
    }
  | {
      dimension: "certification";
      score: number;
      weight: number;
      reason: string;
      facts: CertificationFacts;
    }
  | {
      dimension: "timing";
      score: number;
      weight: number;
      reason: string;
      facts: TimingFacts;
    }
  | {
      dimension: "velocity";
      score: number;
      weight: number;
      reason: string;
      facts: VelocityFacts;
    }
  | {
      dimension: "fulfillment";
      score: number;
      weight: number;
      reason: string;
      facts: FulfillmentFacts;
    };

const CANONICAL_INDEX: ReadonlyMap<DimensionKey, number> = new Map(
  DIMENSION_ORDER.map((key, index) => [key, index]),
);

/**
 * Selection algorithm: rank each dimension by "headroom cost" — how many
 * points of the *overall* score are being left on the table by that
 * dimension, i.e. `(100 - subScore) * (weight / 100)`. That's the exact
 * arithmetic `computeOverallScore` uses to build the composite, so headroom
 * cost literally answers "how much would fixing this dimension to a perfect
 * 100 raise the overall score?" — which is a more faithful reading of FR-03's
 * "highest-priority gap" than picking the single lowest raw sub-score would
 * be. A middling score in Margin (27% weight) can cost more real points than
 * a catastrophic score in Fulfillment (9% weight), and priority should track
 * that, not just which number is smallest.
 *
 * The dimension with the greatest headroom cost wins. Ties are broken, in
 * order:
 *   1. Lower raw sub-score wins. A steeper, more concrete gap reads as more
 *      "blocking" than a diffuse one even when the arithmetic impact is
 *      identical — and it matches FR-03's own example, where the surfaced
 *      blocker is a hard, specific fact (a 90-day lead time), not a
 *      percentage-point abstraction.
 *   2. `DIMENSION_ORDER` (highest weight first) as a final, fully
 *      deterministic tiebreak — needed for the degenerate case where every
 *      dimension ties (e.g. a perfect 100 across the board: cost is 0 for
 *      all six, so the "blocker" is a formality, but the function must still
 *      return exactly one dimension, never zero).
 *
 * This function always returns exactly one dimension — there is no
 * "no blocker" case, matching FR-03's "never two" (and implicitly, never
 * zero).
 */
export function selectBlocker(dimensions: DimensionScores): BlockerResult {
  let winner: DimensionKey = DIMENSION_ORDER[0];
  let winnerCost = -Infinity;
  let winnerScore = Infinity;

  for (const key of DIMENSION_ORDER) {
    const weight = DIMENSION_WEIGHTS[key];
    const score = dimensions[key].score;
    const headroomCost = (100 - score) * (weight / 100);

    const isBetter =
      headroomCost > winnerCost ||
      (headroomCost === winnerCost && score < winnerScore) ||
      (headroomCost === winnerCost &&
        score === winnerScore &&
        (CANONICAL_INDEX.get(key) ?? 0) < (CANONICAL_INDEX.get(winner) ?? 0));

    if (isBetter) {
      winner = key;
      winnerCost = headroomCost;
      winnerScore = score;
    }
  }

  return toBlockerResult(winner, dimensions);
}

function toBlockerResult(
  key: DimensionKey,
  dimensions: DimensionScores,
): BlockerResult {
  const weight = DIMENSION_WEIGHTS[key];

  switch (key) {
    case "margin":
      return {
        dimension: "margin",
        score: dimensions.margin.score,
        weight,
        reason: dimensions.margin.reason,
        facts: dimensions.margin.facts,
      };
    case "distributor":
      return {
        dimension: "distributor",
        score: dimensions.distributor.score,
        weight,
        reason: dimensions.distributor.reason,
        facts: dimensions.distributor.facts,
      };
    case "certification":
      return {
        dimension: "certification",
        score: dimensions.certification.score,
        weight,
        reason: dimensions.certification.reason,
        facts: dimensions.certification.facts,
      };
    case "timing":
      return {
        dimension: "timing",
        score: dimensions.timing.score,
        weight,
        reason: dimensions.timing.reason,
        facts: dimensions.timing.facts,
      };
    case "velocity":
      return {
        dimension: "velocity",
        score: dimensions.velocity.score,
        weight,
        reason: dimensions.velocity.reason,
        facts: dimensions.velocity.facts,
      };
    case "fulfillment":
      return {
        dimension: "fulfillment",
        score: dimensions.fulfillment.score,
        weight,
        reason: dimensions.fulfillment.reason,
        facts: dimensions.fulfillment.facts,
      };
    default: {
      // Exhaustiveness guard: if a new DimensionKey is ever added without a
      // case above, this line fails to compile (tsconfig doesn't set
      // `noImplicitReturns`, so without this the switch would silently
      // return `undefined` at runtime instead of erroring at build time).
      const _exhaustive: never = key;
      throw new Error(`Unhandled dimension key: ${String(_exhaustive)}`);
    }
  }
}
