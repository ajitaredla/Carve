import { describe, expect, it } from "vitest";
import {
  FOUNDER_MARGIN_MARGINAL_THRESHOLD_PCT,
  FOUNDER_MARGIN_PASS_THRESHOLD_PCT,
  calculateWaterfall,
  determineInvestorVerdict,
} from "./calculator";
import type { WaterfallInput } from "./types";

/** Sum of a WaterfallResult's moneyFlow steps, from a zero base. */
function sumMoneyFlow(result: ReturnType<typeof calculateWaterfall>): number {
  return result.moneyFlow.reduce((sum, step) => sum + step.amount, 0);
}

describe("calculateWaterfall — FR-03 worked example", () => {
  it("matches: a $4.50 wholesale price gives Sprouts a 55% margin off a $10 MSRP", () => {
    const input: WaterfallInput = {
      factoryCost: 1.0,
      coPackingFee: 0.3,
      freightToDc: 0.2,
      distributorMarkupPct: 0, // direct-to-retailer, no distributor tier
      retailerMarginPct: 55,
      chargebackEstimate: 0.1,
      msrp: 10,
    };

    const result = calculateWaterfall(input);

    // retailerCostBasis = 10 * (1 - 0.55) = 4.50; with no distributor markup,
    // wholesalePrice = retailerCostBasis = 4.50 — exactly the PRD's example.
    expect(result.economics.wholesalePrice).toBeCloseTo(4.5, 4);
    expect(result.economics.retailerCostBasis).toBeCloseTo(4.5, 4);
    expect(result.retailerMarginPct).toBe(55);

    // landedUnitCost = 1.00 + 0.30 + 0.20 = 1.50
    expect(result.economics.landedUnitCost).toBeCloseTo(1.5, 4);

    // founderNetProceeds = 4.50 - 0.10 = 4.40; founderGrossProfit = 4.40 - 1.50 = 2.90
    // founderMarginPct = 2.90 / 4.40 * 100 = 65.9090...%
    expect(result.economics.founderNetProceedsPerUnit).toBeCloseTo(4.4, 4);
    expect(result.founderMarginPct).toBeCloseTo(65.9091, 3);
    expect(result.investorVerdict).toBe("pass");

    // The additive money flow always reconciles to MSRP.
    expect(sumMoneyFlow(result)).toBeCloseTo(input.msrp, 3);
  });
});

describe("calculateWaterfall — clearly pass scenario", () => {
  it("verdicts pass with comfortable founder margin", () => {
    const input: WaterfallInput = {
      factoryCost: 2,
      coPackingFee: 0.5,
      freightToDc: 0.5,
      distributorMarkupPct: 0,
      retailerMarginPct: 45,
      chargebackEstimate: 0.5,
      msrp: 20,
    };

    const result = calculateWaterfall(input);

    // retailerCostBasis = wholesalePrice = 20 * 0.55 = 11
    expect(result.economics.wholesalePrice).toBeCloseTo(11, 4);
    // founderNetProceeds = 11 - 0.5 = 10.5; landedUnitCost = 3
    // founderMarginPct = (10.5 - 3) / 10.5 * 100 = 71.4286%
    expect(result.founderMarginPct).toBeCloseTo(71.4286, 3);
    expect(result.founderMarginPct).toBeGreaterThanOrEqual(
      FOUNDER_MARGIN_PASS_THRESHOLD_PCT,
    );
    expect(result.investorVerdict).toBe("pass");
    expect(sumMoneyFlow(result)).toBeCloseTo(input.msrp, 3);
  });
});

describe("calculateWaterfall — clearly fail scenario (negative founder margin)", () => {
  it("verdicts fail when landed cost exceeds net proceeds", () => {
    const input: WaterfallInput = {
      factoryCost: 8,
      coPackingFee: 1,
      freightToDc: 1,
      distributorMarkupPct: 0,
      retailerMarginPct: 40,
      chargebackEstimate: 0,
      msrp: 10,
    };

    const result = calculateWaterfall(input);

    // wholesalePrice = retailerCostBasis = 10 * 0.6 = 6; landedUnitCost = 10
    // founderGrossProfit = 6 - 10 = -4; founderMarginPct = -4 / 6 * 100 = -66.67%
    expect(result.economics.wholesalePrice).toBeCloseTo(6, 4);
    expect(result.economics.founderGrossProfitPerUnit).toBeCloseTo(-4, 4);
    expect(result.founderMarginPct).toBeCloseTo(-66.6667, 3);
    expect(result.founderMarginPct).toBeLessThan(0);
    expect(result.investorVerdict).toBe("fail");
  });

  it("throws a descriptive error when chargebacks consume the entire wholesale price", () => {
    const input: WaterfallInput = {
      factoryCost: 1,
      coPackingFee: 0,
      freightToDc: 0,
      distributorMarkupPct: 0,
      retailerMarginPct: 40,
      chargebackEstimate: 10, // >= the $6 derived wholesale price
      msrp: 10,
    };

    expect(() => calculateWaterfall(input)).toThrow(/net proceeds/i);
  });
});

describe("calculateWaterfall / determineInvestorVerdict — boundary cases", () => {
  it("computes an exact 50% founder margin from a full waterfall input and verdicts pass (inclusive boundary)", () => {
    const input: WaterfallInput = {
      factoryCost: 3,
      coPackingFee: 1,
      freightToDc: 1, // landedUnitCost = 5
      distributorMarkupPct: 0,
      retailerMarginPct: 50,
      chargebackEstimate: 0,
      msrp: 20, // retailerCostBasis = wholesalePrice = 10
    };

    const result = calculateWaterfall(input);

    // founderNetProceeds = 10; founderGrossProfit = 10 - 5 = 5
    // founderMarginPct = 5 / 10 * 100 = exactly 50
    expect(result.founderMarginPct).toBe(50);
    expect(result.investorVerdict).toBe("pass");
  });

  it("treats the pass threshold as inclusive", () => {
    expect(determineInvestorVerdict(FOUNDER_MARGIN_PASS_THRESHOLD_PCT)).toBe(
      "pass",
    );
    expect(
      determineInvestorVerdict(FOUNDER_MARGIN_PASS_THRESHOLD_PCT - 0.01),
    ).toBe("marginal");
  });

  it("treats the marginal threshold as inclusive", () => {
    expect(
      determineInvestorVerdict(FOUNDER_MARGIN_MARGINAL_THRESHOLD_PCT),
    ).toBe("marginal");
    expect(
      determineInvestorVerdict(FOUNDER_MARGIN_MARGINAL_THRESHOLD_PCT - 0.01),
    ).toBe("fail");
  });

  it("verdicts fail on a very negative founder margin", () => {
    expect(determineInvestorVerdict(-50)).toBe("fail");
  });
});

describe("calculateWaterfall — currency precision", () => {
  it("guards against classic binary floating-point drift (0.1 + 0.2 !== 0.3 in raw JS)", () => {
    const input: WaterfallInput = {
      factoryCost: 0.1,
      coPackingFee: 0.2,
      freightToDc: 0,
      distributorMarkupPct: 0,
      retailerMarginPct: 50,
      chargebackEstimate: 0,
      msrp: 10,
    };

    // Sanity-check the premise: raw JS addition of these two inputs is not
    // exactly 0.3 (this is precisely the failure mode `round()` guards against).
    expect(input.factoryCost + input.coPackingFee).not.toBe(0.3);

    const result = calculateWaterfall(input);

    // The calculator's rounding must still land on the clean value.
    expect(result.economics.landedUnitCost).toBe(0.3);
  });

  it("retains sub-cent precision rather than rounding to whole cents", () => {
    const input: WaterfallInput = {
      factoryCost: 1,
      coPackingFee: 0,
      freightToDc: 0,
      distributorMarkupPct: 10, // 10% markup-on-cost
      retailerMarginPct: 40,
      chargebackEstimate: 0,
      msrp: 10,
    };

    const result = calculateWaterfall(input);

    // retailerCostBasis = 10 * 0.6 = 6; wholesalePrice = 6 / 1.1 = 5.4545...
    // A cents-only rounding would collapse this to 5.45 and lose precision.
    expect(result.economics.wholesalePrice).toBeCloseTo(5.4545, 4);
    expect(result.economics.wholesalePrice).not.toBe(5.45);
  });
});

describe("calculateWaterfall — input validation", () => {
  const base: WaterfallInput = {
    factoryCost: 1,
    coPackingFee: 0.2,
    freightToDc: 0.2,
    distributorMarkupPct: 10,
    retailerMarginPct: 40,
    chargebackEstimate: 0.1,
    msrp: 10,
  };

  it("throws on a non-positive MSRP", () => {
    expect(() => calculateWaterfall({ ...base, msrp: 0 })).toThrow(/msrp/i);
  });

  it("throws when retailer margin % is 100 or more", () => {
    expect(() =>
      calculateWaterfall({ ...base, retailerMarginPct: 100 }),
    ).toThrow(/retailerMarginPct/);
  });

  it("throws when retailer margin % is negative (would push retailer cost basis above MSRP)", () => {
    expect(() =>
      calculateWaterfall({ ...base, retailerMarginPct: -5 }),
    ).toThrow(/retailerMarginPct/);
  });

  it("throws when distributor markup % is negative", () => {
    expect(() =>
      calculateWaterfall({ ...base, distributorMarkupPct: -0.01 }),
    ).toThrow(/distributorMarkupPct/);
  });

  it("throws on negative cost-side inputs", () => {
    expect(() => calculateWaterfall({ ...base, factoryCost: -1 })).toThrow(
      /factoryCost/,
    );
  });
});
