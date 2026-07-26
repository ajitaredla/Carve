import { describe, expect, it } from "vitest";
import {
  computeOverallScore,
  scoreCertificationReadiness,
  scoreDimensions,
  scoreDistributorReadiness,
  scoreFulfillmentReadiness,
  scoreMarginReadiness,
  scoreTiming,
  scoreVelocity,
} from "./dimensions";
import { DIMENSION_WEIGHTS, type ScoringInput } from "./types";

describe("DIMENSION_WEIGHTS", () => {
  it("sums to exactly 100 (corrected from the PRD's original 110% draft)", () => {
    const total = Object.values(DIMENSION_WEIGHTS).reduce(
      (sum, weight) => sum + weight,
      0,
    );
    expect(total).toBe(100);
  });
});

describe("scoreMarginReadiness", () => {
  it("scores 100 when margin comfortably clears the minimum (surplus >= 15pts)", () => {
    const result = scoreMarginReadiness({
      wholesalePrice: 2.0,
      retailPrice: 8.0,
      retailerMinGrossMarginPct: 40,
    });
    // actual margin = (8 - 2) / 8 * 100 = 75%; surplus = 35pts >= cap of 15.
    expect(result.score).toBe(100);
    expect(result.facts.actualMarginPct).toBeCloseTo(75);
    expect(result.facts.marginSurplusPct).toBeCloseTo(35);
  });

  it("scores 70 when margin sits exactly at the retailer's minimum", () => {
    const result = scoreMarginReadiness({
      wholesalePrice: 4.5,
      retailPrice: 10,
      retailerMinGrossMarginPct: 55,
    });
    // actual margin = (10 - 4.5) / 10 * 100 = 55%; surplus = 0.
    expect(result.facts.actualMarginPct).toBeCloseTo(55);
    expect(result.score).toBe(70);
  });

  it("matches the FR-03 PRD example: $4.50 wholesale clears Sprouts' 40% minimum", () => {
    const result = scoreMarginReadiness({
      wholesalePrice: 4.5,
      retailPrice: 10,
      retailerMinGrossMarginPct: 40,
    });
    expect(result.facts.actualMarginPct).toBeCloseTo(55);
    expect(result.facts.marginSurplusPct).toBeCloseTo(15);
    expect(result.score).toBe(100);
    expect(result.reason).toContain("55.0%");
  });

  it("scores 0 (near-zero case) when margin is far below the minimum", () => {
    const result = scoreMarginReadiness({
      wholesalePrice: 9,
      retailPrice: 10,
      retailerMinGrossMarginPct: 50,
    });
    // actual margin = 10%; deficit = -40pts, beyond the -20pt floor.
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/below/);
  });

  it("scores 0 and floors correctly on a genuinely negative margin (wholesale exceeds retail)", () => {
    const result = scoreMarginReadiness({
      wholesalePrice: 12,
      retailPrice: 10,
      retailerMinGrossMarginPct: 40,
    });
    // actual margin = (10 - 12) / 10 * 100 = -20%; deficit = -60pts, far
    // beyond the -20pt floor — still must clamp to a valid 0, not NaN/negative.
    expect(result.facts.actualMarginPct).toBeCloseTo(-20);
    expect(result.facts.marginSurplusPct).toBeCloseTo(-60);
    expect(result.score).toBe(0);
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it("throws on a non-positive retail price", () => {
    expect(() =>
      scoreMarginReadiness({
        wholesalePrice: 1,
        retailPrice: 0,
        retailerMinGrossMarginPct: 40,
      }),
    ).toThrow();
  });
});

describe("scoreDistributorReadiness", () => {
  it("scores 100 when relationship + EDI + EFT are all in place", () => {
    const result = scoreDistributorReadiness({
      hasKeheRelationship: true,
      hasUnfiRelationship: false,
      ediCapable: true,
      eftCapable: true,
    });
    expect(result.score).toBe(100);
    expect(result.facts.hasDistributorRelationship).toBe(true);
  });

  it("scores 0 when nothing is in place (near-zero case)", () => {
    const result = scoreDistributorReadiness({
      hasKeheRelationship: false,
      hasUnfiRelationship: false,
      ediCapable: false,
      eftCapable: false,
    });
    expect(result.score).toBe(0);
    expect(result.reason).toContain("KeHE or UNFI");
    expect(result.reason).toContain("EDI");
    expect(result.reason).toContain("EFT");
  });

  it("treats UNFI-only the same as KeHE-only for the relationship credit", () => {
    const unfiOnly = scoreDistributorReadiness({
      hasKeheRelationship: false,
      hasUnfiRelationship: true,
      ediCapable: false,
      eftCapable: false,
    });
    expect(unfiOnly.score).toBe(60);
  });
});

describe("scoreCertificationReadiness", () => {
  it("scores 100 when nothing is required", () => {
    const result = scoreCertificationReadiness({
      requiredCertifications: [],
      heldCertifications: [],
    });
    expect(result.score).toBe(100);
  });

  it("scores 100 when all required certs are held", () => {
    const result = scoreCertificationReadiness({
      requiredCertifications: ["usda_organic", "sqf"],
      heldCertifications: ["usda_organic", "sqf", "non_gmo"],
    });
    expect(result.score).toBe(100);
    expect(result.facts.missingCertifications).toEqual([]);
  });

  it("scores proportionally when some required certs are missing", () => {
    const result = scoreCertificationReadiness({
      requiredCertifications: ["usda_organic", "sqf", "gluten_free", "brc"],
      heldCertifications: ["usda_organic"],
    });
    expect(result.score).toBe(25);
    expect(result.facts.missingCertifications).toEqual([
      "sqf",
      "gluten_free",
      "brc",
    ]);
  });

  it("scores 0 (near-zero case) when none of the required certs are held", () => {
    const result = scoreCertificationReadiness({
      requiredCertifications: ["usda_organic"],
      heldCertifications: [],
    });
    expect(result.score).toBe(0);
  });
});

describe("scoreTiming", () => {
  it("scores 100 when the submission window is currently open", () => {
    const result = scoreTiming({
      submissionWindowOpen: true,
      daysUntilNextWindow: null,
    });
    expect(result.score).toBe(100);
  });

  it("scores low but non-zero when the next window date is unknown", () => {
    const result = scoreTiming({
      submissionWindowOpen: false,
      daysUntilNextWindow: null,
    });
    expect(result.score).toBe(20);
  });

  it("scores higher the sooner the next window opens", () => {
    const soon = scoreTiming({
      submissionWindowOpen: false,
      daysUntilNextWindow: 10,
    });
    const far = scoreTiming({
      submissionWindowOpen: false,
      daysUntilNextWindow: 300,
    });
    expect(soon.score).toBeGreaterThan(far.score);
  });

  it("floors out (near-zero case) for a window a year or more away", () => {
    const result = scoreTiming({
      submissionWindowOpen: false,
      daysUntilNextWindow: 365,
    });
    expect(result.score).toBe(10);
  });
});

describe("scoreVelocity", () => {
  it("scores 0 for a DTC-only brand with zero velocity data (edge case)", () => {
    const result = scoreVelocity({
      isDtcOnly: true,
      unitsPerStorePerWeek: 50, // must be ignored when isDtcOnly is true
    });
    expect(result.score).toBe(0);
    expect(result.facts.unitsPerStorePerWeek).toBe(0);
    expect(result.reason).toContain("DTC-only");
  });

  it("scores 70 at exactly the PRD's 3 UPSPW benchmark minimum", () => {
    const result = scoreVelocity({
      isDtcOnly: false,
      unitsPerStorePerWeek: 3,
    });
    expect(result.score).toBe(70);
  });

  it("scores 100 (full case) at or above 6 UPSPW", () => {
    const result = scoreVelocity({
      isDtcOnly: false,
      unitsPerStorePerWeek: 6,
    });
    expect(result.score).toBe(100);
  });

  it("scores between 0 and 70 below the benchmark minimum", () => {
    const result = scoreVelocity({
      isDtcOnly: false,
      unitsPerStorePerWeek: 1.5,
    });
    expect(result.score).toBe(35);
  });
});

describe("scoreFulfillmentReadiness", () => {
  it("scores 100 (full case) when everything is in place with a fast lead time", () => {
    const result = scoreFulfillmentReadiness({
      hasCoManufacturer: true,
      leadTimeDays: 20,
      hasRegionalProductionCapacity: true,
    });
    expect(result.score).toBe(100);
    expect(result.facts.meetsLeadTimeRequirement).toBe(true);
  });

  it("scores 0 (near-zero case) when nothing is in place and lead time is very long", () => {
    const result = scoreFulfillmentReadiness({
      hasCoManufacturer: false,
      leadTimeDays: 120,
      hasRegionalProductionCapacity: false,
    });
    expect(result.score).toBe(0);
  });

  it("matches the FR-03 PRD example: co-manufacturer in place but a 90-day lead time blocks fulfillment", () => {
    const result = scoreFulfillmentReadiness({
      hasCoManufacturer: true,
      leadTimeDays: 90,
      hasRegionalProductionCapacity: true,
    });
    // co-man (40) + lead time (0, at the 90-day floor) + capacity (25) = 65.
    expect(result.score).toBe(65);
    expect(result.facts.meetsLeadTimeRequirement).toBe(false);
    expect(result.reason).toContain("90-day");
  });
});

describe("scoreDimensions + computeOverallScore", () => {
  const perfectInput: ScoringInput = {
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

  const worstInput: ScoringInput = {
    margin: { wholesalePrice: 10, retailPrice: 10, retailerMinGrossMarginPct: 50 },
    distributor: {
      hasKeheRelationship: false,
      hasUnfiRelationship: false,
      ediCapable: false,
      eftCapable: false,
    },
    certification: {
      requiredCertifications: ["usda_organic"],
      heldCertifications: [],
    },
    timing: { submissionWindowOpen: false, daysUntilNextWindow: 365 },
    velocity: { isDtcOnly: true },
    fulfillment: {
      hasCoManufacturer: false,
      leadTimeDays: 120,
      hasRegionalProductionCapacity: false,
    },
  };

  it("aggregates to a full 100 when every dimension is perfect", () => {
    const dims = scoreDimensions(perfectInput);
    for (const key of Object.keys(dims) as (keyof typeof dims)[]) {
      expect(dims[key].score).toBe(100);
    }
    expect(computeOverallScore(dims)).toBe(100);
  });

  it("aggregates to near-zero when every dimension is at its floor", () => {
    const dims = scoreDimensions(worstInput);
    const overall = computeOverallScore(dims);
    expect(overall).toBeLessThanOrEqual(10);
    expect(overall).toBeGreaterThanOrEqual(0);
  });

  it("computes the weighted sum exactly from rounded sub-scores", () => {
    const dims = scoreDimensions(worstInput);
    const expected =
      dims.margin.score * 0.27 +
      dims.distributor.score * 0.23 +
      dims.certification.score * 0.18 +
      dims.timing.score * 0.13 +
      dims.velocity.score * 0.1 +
      dims.fulfillment.score * 0.09;
    expect(computeOverallScore(dims)).toBe(Math.round(expected));
  });
});
