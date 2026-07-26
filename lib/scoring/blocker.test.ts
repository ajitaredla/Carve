import { describe, expect, it } from "vitest";
import { selectBlocker } from "./blocker";
import { scoreDimensions } from "./dimensions";
import type { DimensionScores, ScoringInput } from "./types";

/** Build a full set of dimension scores, all "perfect" by default, with overrides. */
function buildInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  const base: ScoringInput = {
    margin: {
      wholesalePrice: 2,
      retailPrice: 10,
      retailerMinGrossMarginPct: 40,
    },
    distributor: {
      hasKeheRelationship: true,
      hasUnfiRelationship: true,
      ediCapable: true,
      eftCapable: true,
    },
    certification: { requiredCertifications: [], heldCertifications: [] },
    timing: { submissionWindowOpen: true, daysUntilNextWindow: null },
    velocity: { isDtcOnly: false, unitsPerStorePerWeek: 10 },
    fulfillment: {
      hasCoManufacturer: true,
      leadTimeDays: 10,
      hasRegionalProductionCapacity: true,
    },
  };
  return { ...base, ...overrides };
}

function buildDimensions(overrides: Partial<ScoringInput> = {}): DimensionScores {
  return scoreDimensions(buildInput(overrides));
}

describe("selectBlocker", () => {
  it("matches the FR-03 PRD example: margin clears the minimum, fulfillment (90-day lead time) is the blocker", () => {
    const dims = buildDimensions({
      margin: {
        wholesalePrice: 4.5,
        retailPrice: 10,
        retailerMinGrossMarginPct: 40,
      },
      fulfillment: {
        hasCoManufacturer: true,
        leadTimeDays: 90,
        hasRegionalProductionCapacity: true,
      },
    });

    const blocker = selectBlocker(dims);

    expect(blocker.dimension).toBe("fulfillment");
    if (blocker.dimension === "fulfillment") {
      // Type-narrowing check: facts should be FulfillmentFacts here.
      expect(blocker.facts.leadTimeDays).toBe(90);
      expect(blocker.facts.meetsLeadTimeRequirement).toBe(false);
    }
  });

  it("picks the single worst dimension when one dimension is catastrophic", () => {
    const dims = buildDimensions({
      distributor: {
        hasKeheRelationship: false,
        hasUnfiRelationship: false,
        ediCapable: false,
        eftCapable: false,
      },
    });

    const blocker = selectBlocker(dims);
    expect(blocker.dimension).toBe("distributor");
  });

  it("always returns exactly one dimension, never zero, never a list", () => {
    const dims = buildDimensions();
    const blocker = selectBlocker(dims);
    expect(typeof blocker.dimension).toBe("string");
    expect(
      ["margin", "distributor", "certification", "timing", "velocity", "fulfillment"].includes(
        blocker.dimension,
      ),
    ).toBe(true);
  });

  it("falls back to canonical dimension order (margin first) when every dimension ties at a perfect 100 (full-100 case)", () => {
    const dims = buildDimensions(); // every dimension perfect -> headroom cost 0 across the board
    for (const key of Object.keys(dims) as (keyof DimensionScores)[]) {
      expect(dims[key].score).toBe(100);
    }

    const blocker = selectBlocker(dims);
    expect(blocker.dimension).toBe("margin");
  });

  it("breaks an exact headroom-cost tie by preferring the lower raw sub-score", () => {
    const dims = buildDimensions();
    // Directly override sub-scores post-scoring to construct an exact tie:
    // fulfillment score 0, weight 9 -> cost 9.0
    // margin score 66.6667 (66 + 2/3), weight 27 -> cost (100 - 66.6667) * 0.27 = 9.0
    const rigged: DimensionScores = {
      ...dims,
      margin: { ...dims.margin, score: 200 / 3 },
      fulfillment: { ...dims.fulfillment, score: 0 },
    };

    const marginCost = (100 - rigged.margin.score) * (27 / 100);
    const fulfillmentCost = (100 - rigged.fulfillment.score) * (9 / 100);
    expect(marginCost).toBeCloseTo(fulfillmentCost, 6);

    const blocker = selectBlocker(rigged);
    expect(blocker.dimension).toBe("fulfillment");
  });

  it("prefers higher weight when every dimension has an equal (non-100) raw score", () => {
    const dims = buildDimensions();
    // NOTE: this does NOT exercise the canonical-order tiebreak — that only
    // fires when cost AND score are both tied, which (since cost is score's
    // complement scaled linearly by weight) is only possible when every
    // weight ties too, or trivially when score = 100 for everyone (cost = 0
    // regardless of weight — see the "full-100" test above, which is the
    // real canonical-order coverage). Here scores are equal at 50 but
    // weights differ, so headroom cost differs too, and the tiebreak logic
    // is never reached: margin (highest weight) wins on cost alone. This
    // test exists to confirm that outright-cost win, not the tiebreak.
    const rigged: DimensionScores = {
      margin: { ...dims.margin, score: 50 },
      distributor: { ...dims.distributor, score: 50 },
      certification: { ...dims.certification, score: 50 },
      timing: { ...dims.timing, score: 50 },
      velocity: { ...dims.velocity, score: 50 },
      fulfillment: { ...dims.fulfillment, score: 50 },
    };

    // All scores equal, but weights differ, so headroom cost differs too —
    // margin (highest weight, 27) should have the greatest cost and win
    // outright (not even needing the score or canonical tiebreak).
    const blocker = selectBlocker(rigged);
    expect(blocker.dimension).toBe("margin");
  });
});
