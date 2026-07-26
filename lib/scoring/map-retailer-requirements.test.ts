import { describe, expect, it } from "vitest";
import {
  ScoringInputMappingError,
  getRetailerDataVersion,
  parseRetailerRequirements,
  scoreDimensionsSafe,
  scoreMarginReadinessSafe,
  toScoringInput,
  type BrandScoringFacts,
} from "./map-retailer-requirements";
import { Prisma, type Retailer } from "@prisma/client";

const { Decimal } = Prisma;

function makeRetailer(requirements: unknown): Retailer {
  return {
    id: "retailer-1",
    slug: "sprouts",
    name: "Sprouts Farmers Market",
    requirements: requirements as Retailer["requirements"],
    updatedAt: new Date("2026-01-15T00:00:00.000Z"),
  };
}

const VALID_REQUIREMENTS = {
  minGrossMarginPct: 40,
  requiredCertifications: ["usda_organic", "non_gmo"],
  submissionWindow: { open: true, daysUntilNextWindow: null },
};

function makeBrand(overrides: Partial<BrandScoringFacts> = {}): BrandScoringFacts {
  return {
    id: "brand-1",
    name: "Test Brand",
    category: "snacks",
    wholesalePrice: new Decimal(4.5),
    retailPrice: new Decimal(10),
    hasKeheRelationship: true,
    hasUnfiRelationship: false,
    ediCapable: true,
    eftCapable: true,
    heldCertifications: ["usda_organic"],
    isDtcOnly: false,
    unitsPerStorePerWeek: new Decimal(5),
    hasCoManufacturer: true,
    leadTimeDays: 20,
    hasRegionalProductionCapacity: true,
    ...overrides,
  };
}

describe("parseRetailerRequirements", () => {
  it("parses a valid requirements blob", () => {
    const retailer = makeRetailer(VALID_REQUIREMENTS);
    const parsed = parseRetailerRequirements(retailer);
    expect(parsed.minGrossMarginPct).toBe(40);
    expect(parsed.requiredCertifications).toEqual(["usda_organic", "non_gmo"]);
    expect(parsed.submissionWindow).toEqual({ open: true, daysUntilNextWindow: null });
  });

  it("accepts optional informational fields when present", () => {
    const retailer = makeRetailer({
      ...VALID_REQUIREMENTS,
      distributorOptions: ["KeHE", "UNFI"],
      velocityBenchmarkUpspw: 3,
      fulfillmentRequirements: { maxLeadTimeDays: 30 },
      programName: "Sprouts New Item Program",
    });
    const parsed = parseRetailerRequirements(retailer);
    expect(parsed.distributorOptions).toEqual(["KeHE", "UNFI"]);
    expect(parsed.programName).toBe("Sprouts New Item Program");
  });

  it("throws a structured ScoringInputMappingError when a required field is missing", () => {
    const retailer = makeRetailer({
      // minGrossMarginPct missing entirely — must NOT be silently defaulted.
      requiredCertifications: ["usda_organic"],
      submissionWindow: { open: true, daysUntilNextWindow: null },
    });

    expect(() => parseRetailerRequirements(retailer)).toThrow(ScoringInputMappingError);
    try {
      parseRetailerRequirements(retailer);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ScoringInputMappingError);
      const mappingError = error as ScoringInputMappingError;
      expect(mappingError.issues.length).toBeGreaterThan(0);
      expect(mappingError.issues[0].path).toContain("minGrossMarginPct");
      expect(mappingError.message).toContain("sprouts");
    }
  });

  it("throws when requiredCertifications is absent rather than defaulting to []", () => {
    const retailer = makeRetailer({
      minGrossMarginPct: 40,
      submissionWindow: { open: true, daysUntilNextWindow: null },
      // requiredCertifications omitted entirely.
    });

    expect(() => parseRetailerRequirements(retailer)).toThrow(ScoringInputMappingError);
  });

  it("throws when requirements is not even an object", () => {
    const retailer = makeRetailer("not-an-object");
    expect(() => parseRetailerRequirements(retailer)).toThrow(ScoringInputMappingError);
  });

  it("rejects an unrecognized certification value", () => {
    const retailer = makeRetailer({
      ...VALID_REQUIREMENTS,
      requiredCertifications: ["not_a_real_certification"],
    });
    expect(() => parseRetailerRequirements(retailer)).toThrow(ScoringInputMappingError);
  });
});

describe("toScoringInput", () => {
  it("maps brand facts + retailer requirements onto ScoringInput", () => {
    const brand = makeBrand();
    const retailer = makeRetailer(VALID_REQUIREMENTS);

    const input = toScoringInput(brand, retailer);

    expect(input).toEqual({
      margin: {
        wholesalePrice: 4.5,
        retailPrice: 10,
        retailerMinGrossMarginPct: 40,
      },
      distributor: {
        hasKeheRelationship: true,
        hasUnfiRelationship: false,
        ediCapable: true,
        eftCapable: true,
      },
      certification: {
        requiredCertifications: ["usda_organic", "non_gmo"],
        heldCertifications: ["usda_organic"],
      },
      timing: {
        submissionWindowOpen: true,
        daysUntilNextWindow: null,
      },
      velocity: {
        isDtcOnly: false,
        unitsPerStorePerWeek: 5,
      },
      fulfillment: {
        hasCoManufacturer: true,
        leadTimeDays: 20,
        hasRegionalProductionCapacity: true,
      },
    });
  });

  it("propagates a structured error when the retailer's requirements JSON is invalid", () => {
    const brand = makeBrand();
    const retailer = makeRetailer({ minGrossMarginPct: 40 }); // missing required fields

    expect(() => toScoringInput(brand, retailer)).toThrow(ScoringInputMappingError);
  });
});

describe("getRetailerDataVersion", () => {
  it("stamps Retailer.updatedAt as an ISO-8601 string", () => {
    const retailer = makeRetailer(VALID_REQUIREMENTS);
    expect(getRetailerDataVersion(retailer)).toBe("2026-01-15T00:00:00.000Z");
  });
});

describe("scoreDimensionsSafe / scoreMarginReadinessSafe", () => {
  it("wraps the known scoreMarginReadiness throw (retailPrice <= 0) as a structured error", () => {
    const brand = makeBrand({ retailPrice: new Decimal(0) });
    const retailer = makeRetailer(VALID_REQUIREMENTS);
    const input = toScoringInput(brand, retailer);

    expect(() => scoreDimensionsSafe(input)).toThrow(ScoringInputMappingError);
    expect(() => scoreMarginReadinessSafe(input.margin)).toThrow(ScoringInputMappingError);
  });

  it("scores normally when the input is valid", () => {
    const brand = makeBrand();
    const retailer = makeRetailer(VALID_REQUIREMENTS);
    const input = toScoringInput(brand, retailer);

    const scores = scoreDimensionsSafe(input);
    expect(scores.margin.score).toBeGreaterThan(0);
    expect(scores.margin.score).toBeLessThanOrEqual(100);
  });
});
