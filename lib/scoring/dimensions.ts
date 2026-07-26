/**
 * FR-01: per-dimension scoring + overall aggregation.
 *
 * Each `score*` function is a pure function: typed input in, a 0-100
 * sub-score plus a factual `reason` and structured `facts` out. No I/O, no
 * Prisma, no Claude calls — those are wired up elsewhere (the Server Action
 * maps `Brand`/`Retailer.requirements` onto these input types; a later task
 * turns the surfaced blocker's `facts` into founder-facing prose).
 */

import {
  DIMENSION_ORDER,
  DIMENSION_WEIGHTS,
  type CertificationFacts,
  type CertificationReadinessInput,
  type DimensionScore,
  type DimensionScores,
  type DistributorFacts,
  type DistributorReadinessInput,
  type FulfillmentFacts,
  type FulfillmentReadinessInput,
  type MarginFacts,
  type MarginReadinessInput,
  type ScoringInput,
  type TimingFacts,
  type TimingInput,
  type VelocityFacts,
  type VelocityInput,
} from "./types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Clamp to [0, 100] and round to the nearest integer (Assessment score columns are `Int`). */
function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

/** "a", "a and b", "a, b, and c" */
function formatList(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Margin Readiness — 27%
// ---------------------------------------------------------------------------

/**
 * Merely clearing a retailer's minimum gross margin isn't a comfortable
 * pass — a brand sitting right at the floor is one cost increase or promo
 * ask away from failing it. So surplus above the minimum is rewarded (capped
 * at +15 points of margin, where the score maxes out at 100) and any deficit
 * below the minimum is penalized far more steeply, since missing a
 * retailer's hard minimum is close to disqualifying on its own.
 */
const MARGIN_SURPLUS_CAP_PCT = 15;
const MARGIN_DEFICIT_FLOOR_PCT = -20;
const MARGIN_AT_THRESHOLD_SCORE = 70;

export function scoreMarginReadiness(
  input: MarginReadinessInput,
): DimensionScore<MarginFacts> {
  const { wholesalePrice, retailPrice, retailerMinGrossMarginPct } = input;

  if (retailPrice <= 0) {
    throw new Error(
      "MarginReadinessInput.retailPrice must be greater than 0 to compute gross margin.",
    );
  }

  const actualMarginPct = ((retailPrice - wholesalePrice) / retailPrice) * 100;
  const marginSurplusPct = actualMarginPct - retailerMinGrossMarginPct;

  const score =
    marginSurplusPct >= 0
      ? clampScore(
          MARGIN_AT_THRESHOLD_SCORE +
            Math.min(marginSurplusPct, MARGIN_SURPLUS_CAP_PCT) *
              ((100 - MARGIN_AT_THRESHOLD_SCORE) / MARGIN_SURPLUS_CAP_PCT),
        )
      : clampScore(
          MARGIN_AT_THRESHOLD_SCORE +
            Math.max(marginSurplusPct, MARGIN_DEFICIT_FLOOR_PCT) *
              (MARGIN_AT_THRESHOLD_SCORE / Math.abs(MARGIN_DEFICIT_FLOOR_PCT)),
        );

  const reason =
    marginSurplusPct >= 0
      ? `Wholesale price of $${wholesalePrice.toFixed(2)} gives a ${actualMarginPct.toFixed(1)}% margin, ${marginSurplusPct.toFixed(1)} points above the retailer's ${retailerMinGrossMarginPct}% minimum.`
      : `Wholesale price of $${wholesalePrice.toFixed(2)} gives only a ${actualMarginPct.toFixed(1)}% margin, ${Math.abs(marginSurplusPct).toFixed(1)} points below the retailer's ${retailerMinGrossMarginPct}% minimum.`;

  return {
    score,
    reason,
    facts: {
      wholesalePrice,
      retailPrice,
      actualMarginPct,
      requiredMarginPct: retailerMinGrossMarginPct,
      marginSurplusPct,
    },
  };
}

// ---------------------------------------------------------------------------
// Distributor Readiness — 23%
// ---------------------------------------------------------------------------

const DISTRIBUTOR_RELATIONSHIP_POINTS = 60;
const DISTRIBUTOR_EDI_POINTS = 20;
const DISTRIBUTOR_EFT_POINTS = 20;

export function scoreDistributorReadiness(
  input: DistributorReadinessInput,
): DimensionScore<DistributorFacts> {
  const hasDistributorRelationship =
    input.hasKeheRelationship || input.hasUnfiRelationship;

  let score = 0;
  const missing: string[] = [];

  if (hasDistributorRelationship) {
    score += DISTRIBUTOR_RELATIONSHIP_POINTS;
  } else {
    missing.push("a KeHE or UNFI relationship");
  }

  if (input.ediCapable) {
    score += DISTRIBUTOR_EDI_POINTS;
  } else {
    missing.push("EDI capability");
  }

  if (input.eftCapable) {
    score += DISTRIBUTOR_EFT_POINTS;
  } else {
    missing.push("EFT capability");
  }

  const reason =
    missing.length === 0
      ? "Distributor relationship is in place with EDI and EFT capability established."
      : `Missing ${formatList(missing)}.`;

  return {
    score: clampScore(score),
    reason,
    facts: { ...input, hasDistributorRelationship },
  };
}

// ---------------------------------------------------------------------------
// Certification Readiness — 18%
// ---------------------------------------------------------------------------

export function scoreCertificationReadiness(
  input: CertificationReadinessInput,
): DimensionScore<CertificationFacts> {
  const { requiredCertifications, heldCertifications } = input;
  const held = new Set(heldCertifications);
  const missing = requiredCertifications.filter((cert) => !held.has(cert));

  // Nothing required by this retailer means certification can't be a gap.
  const score =
    requiredCertifications.length === 0
      ? 100
      : clampScore(
          ((requiredCertifications.length - missing.length) /
            requiredCertifications.length) *
            100,
        );

  const reason =
    requiredCertifications.length === 0
      ? "Retailer requires no specific certifications."
      : missing.length === 0
        ? `Holds all ${requiredCertifications.length} required certification(s): ${formatList(requiredCertifications)}.`
        : `Missing ${missing.length} of ${requiredCertifications.length} required certification(s): ${formatList(missing)}.`;

  return {
    score,
    reason,
    facts: {
      requiredCertifications,
      heldCertifications,
      missingCertifications: missing,
    },
  };
}

// ---------------------------------------------------------------------------
// Timing — 13%
// ---------------------------------------------------------------------------

const TIMING_UNKNOWN_SCORE = 20;
const TIMING_CEILING_SCORE = 90;
const TIMING_FLOOR_SCORE = 10;
const TIMING_MAX_HORIZON_DAYS = 365;

export function scoreTiming(input: TimingInput): DimensionScore<TimingFacts> {
  const { submissionWindowOpen, daysUntilNextWindow } = input;

  let score: number;
  let reason: string;

  if (submissionWindowOpen) {
    score = 100;
    reason = "Category submission window is currently open.";
  } else if (daysUntilNextWindow === null) {
    // Unknown next window: treated as low-confidence, but not a hard zero —
    // a closed window with no published date is bad, not necessarily fatal.
    score = TIMING_UNKNOWN_SCORE;
    reason =
      "Submission window is closed and the next reset cycle date is not yet known.";
  } else {
    const days = Math.max(0, daysUntilNextWindow);
    const horizonFraction =
      Math.min(days, TIMING_MAX_HORIZON_DAYS) / TIMING_MAX_HORIZON_DAYS;
    score =
      TIMING_CEILING_SCORE -
      horizonFraction * (TIMING_CEILING_SCORE - TIMING_FLOOR_SCORE);
    reason = `Submission window is closed; next reset cycle opens in ${days} day(s).`;
  }

  return {
    score: clampScore(score),
    reason,
    facts: { submissionWindowOpen, daysUntilNextWindow },
  };
}

// ---------------------------------------------------------------------------
// Velocity — 10%
// ---------------------------------------------------------------------------

/** PRD glossary: "Brands typically need 2-3 UPSPW minimum to maintain placement." */
const VELOCITY_BENCHMARK_MIN_UPSPW = 3;
const VELOCITY_STRONG_UPSPW = 6;
const VELOCITY_AT_BENCHMARK_SCORE = 70;

export function scoreVelocity(
  input: VelocityInput,
): DimensionScore<VelocityFacts> {
  // DTC-only brands have no retail shelf presence, so no UPSPW data can
  // exist yet — treated as 0, per FR-01 ("Zero if DTC-only").
  const upspw = input.isDtcOnly
    ? 0
    : Math.max(0, input.unitsPerStorePerWeek ?? 0);

  let score: number;
  if (upspw <= 0) {
    score = 0;
  } else if (upspw >= VELOCITY_STRONG_UPSPW) {
    score = 100;
  } else if (upspw >= VELOCITY_BENCHMARK_MIN_UPSPW) {
    score =
      VELOCITY_AT_BENCHMARK_SCORE +
      ((upspw - VELOCITY_BENCHMARK_MIN_UPSPW) /
        (VELOCITY_STRONG_UPSPW - VELOCITY_BENCHMARK_MIN_UPSPW)) *
        (100 - VELOCITY_AT_BENCHMARK_SCORE);
  } else {
    score = (upspw / VELOCITY_BENCHMARK_MIN_UPSPW) * VELOCITY_AT_BENCHMARK_SCORE;
  }

  const reason = input.isDtcOnly
    ? "Brand is DTC-only with no retail velocity (UPSPW) data yet."
    : upspw <= 0
      ? "No measurable retail velocity data reported."
      : `Existing retail velocity is ${upspw.toFixed(1)} units per store per week (retailers typically expect ${VELOCITY_BENCHMARK_MIN_UPSPW}+ to maintain placement).`;

  return {
    score: clampScore(score),
    reason,
    facts: { isDtcOnly: input.isDtcOnly, unitsPerStorePerWeek: upspw },
  };
}

// ---------------------------------------------------------------------------
// Fulfillment Readiness — 9%
// ---------------------------------------------------------------------------

const FULFILLMENT_COMAN_POINTS = 40;
const FULFILLMENT_LEAD_TIME_POINTS = 35;
const FULFILLMENT_CAPACITY_POINTS = 25;
/** PRD FR-01: "Lead time under 30 days?" */
const LEAD_TIME_MAX_DAYS = 30;
/** Beyond this, lead time earns zero credit. */
const LEAD_TIME_FLOOR_DAYS = 90;

export function scoreFulfillmentReadiness(
  input: FulfillmentReadinessInput,
): DimensionScore<FulfillmentFacts> {
  const { hasCoManufacturer, leadTimeDays, hasRegionalProductionCapacity } =
    input;

  let leadTimeScore: number;
  if (leadTimeDays <= LEAD_TIME_MAX_DAYS) {
    leadTimeScore = FULFILLMENT_LEAD_TIME_POINTS;
  } else if (leadTimeDays >= LEAD_TIME_FLOOR_DAYS) {
    leadTimeScore = 0;
  } else {
    const range = LEAD_TIME_FLOOR_DAYS - LEAD_TIME_MAX_DAYS;
    leadTimeScore =
      FULFILLMENT_LEAD_TIME_POINTS *
      (1 - (leadTimeDays - LEAD_TIME_MAX_DAYS) / range);
  }

  const meetsLeadTimeRequirement = leadTimeDays <= LEAD_TIME_MAX_DAYS;

  const score =
    (hasCoManufacturer ? FULFILLMENT_COMAN_POINTS : 0) +
    leadTimeScore +
    (hasRegionalProductionCapacity ? FULFILLMENT_CAPACITY_POINTS : 0);

  const gaps: string[] = [];
  if (!hasCoManufacturer) gaps.push("no co-manufacturer relationship in place");
  if (!meetsLeadTimeRequirement) {
    gaps.push(
      `a ${leadTimeDays}-day production lead time (retailers expect under ${LEAD_TIME_MAX_DAYS})`,
    );
  }
  if (!hasRegionalProductionCapacity) {
    gaps.push("insufficient production capacity for a regional rollout");
  }

  const reason =
    gaps.length === 0
      ? `Co-manufacturer in place with a ${leadTimeDays}-day lead time and capacity for regional rollout.`
      : `Fulfillment gap: ${formatList(gaps)}.`;

  return {
    score: clampScore(score),
    reason,
    facts: {
      hasCoManufacturer,
      leadTimeDays,
      hasRegionalProductionCapacity,
      meetsLeadTimeRequirement,
    },
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** Score all six dimensions from their typed inputs. */
export function scoreDimensions(input: ScoringInput): DimensionScores {
  return {
    margin: scoreMarginReadiness(input.margin),
    distributor: scoreDistributorReadiness(input.distributor),
    certification: scoreCertificationReadiness(input.certification),
    timing: scoreTiming(input.timing),
    velocity: scoreVelocity(input.velocity),
    fulfillment: scoreFulfillmentReadiness(input.fulfillment),
  };
}

/**
 * Weighted 0-100 overall score (FR-01), computed from already-rounded
 * per-dimension scores so the number a founder sees for "overall" is always
 * exactly reproducible from the six sub-scores they also see — no hidden
 * extra precision that would make the two appear inconsistent.
 */
export function computeOverallScore(dimensions: DimensionScores): number {
  const weightedSum = DIMENSION_ORDER.reduce(
    (sum, key) => sum + dimensions[key].score * (DIMENSION_WEIGHTS[key] / 100),
    0,
  );
  return clampScore(weightedSum);
}
