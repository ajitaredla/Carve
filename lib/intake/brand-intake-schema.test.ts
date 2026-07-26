import { describe, expect, it } from "vitest";
import {
  LEAD_TIME_DAYS_MAX,
  LEAD_TIME_DAYS_MIN,
  validateBrandIntake,
  type BrandIntakeInput,
} from "./brand-intake-schema";

function validInput(overrides: Partial<BrandIntakeInput> = {}): BrandIntakeInput {
  return {
    name: "Acme Snacks",
    category: "Shelf-stable snacks",
    dtcAnnualRevenue: 100_000,
    description: "Crunchy snacks.",
    wholesalePrice: 4.5,
    retailPrice: 7.99,
    hasKeheRelationship: false,
    hasUnfiRelationship: false,
    ediCapable: false,
    eftCapable: false,
    heldCertifications: ["usda_organic"],
    isDtcOnly: true,
    unitsPerStorePerWeek: undefined,
    hasCoManufacturer: false,
    leadTimeDays: 45,
    hasRegionalProductionCapacity: false,
    retailerSlug: "sprouts",
    ...overrides,
  };
}

describe("BrandIntakeSchema / validateBrandIntake", () => {
  it("accepts a fully valid, DTC-only submission", () => {
    const result = validateBrandIntake(validInput());
    expect(result.success).toBe(true);
    expect(result.data?.wholesalePrice).toBe(4.5);
  });

  // Per 6.9's architect review: wholesalePrice <= 0 has NO guard anywhere
  // else in the codebase — this form is the only place that can catch it.
  it("rejects a zero or negative wholesalePrice", () => {
    expect(validateBrandIntake(validInput({ wholesalePrice: 0 })).success).toBe(
      false,
    );
    expect(
      validateBrandIntake(validInput({ wholesalePrice: -1 })).success,
    ).toBe(false);
  });

  it("rejects a zero or negative retailPrice", () => {
    expect(validateBrandIntake(validInput({ retailPrice: 0 })).success).toBe(
      false,
    );
  });

  it("rejects leadTimeDays outside 0-365", () => {
    expect(
      validateBrandIntake(validInput({ leadTimeDays: -1 })).success,
    ).toBe(false);
    expect(
      validateBrandIntake(validInput({ leadTimeDays: LEAD_TIME_DAYS_MAX + 1 }))
        .success,
    ).toBe(false);
  });

  it("accepts leadTimeDays at the exact bounds", () => {
    expect(
      validateBrandIntake(validInput({ leadTimeDays: LEAD_TIME_DAYS_MIN }))
        .success,
    ).toBe(true);
    expect(
      validateBrandIntake(validInput({ leadTimeDays: LEAD_TIME_DAYS_MAX }))
        .success,
    ).toBe(true);
  });

  it("rejects a non-integer leadTimeDays", () => {
    expect(
      validateBrandIntake(validInput({ leadTimeDays: 12.5 })).success,
    ).toBe(false);
  });

  // Per 6.9's architect review: unitsPerStorePerWeek is conditionally
  // meaningful on isDtcOnly — require it when the brand isn't DTC-only,
  // rather than silently letting toScoringInput drop a populated value.
  it("requires unitsPerStorePerWeek when isDtcOnly is false", () => {
    const result = validateBrandIntake(
      validInput({ isDtcOnly: false, unitsPerStorePerWeek: undefined }),
    );
    expect(result.success).toBe(false);
    expect(result.fieldErrors.unitsPerStorePerWeek).toBeTruthy();
  });

  it("accepts unitsPerStorePerWeek when isDtcOnly is false and it's provided", () => {
    const result = validateBrandIntake(
      validInput({ isDtcOnly: false, unitsPerStorePerWeek: 4 }),
    );
    expect(result.success).toBe(true);
  });

  it("does not require unitsPerStorePerWeek when isDtcOnly is true", () => {
    const result = validateBrandIntake(
      validInput({ isDtcOnly: true, unitsPerStorePerWeek: undefined }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects an empty retailerSlug", () => {
    expect(
      validateBrandIntake(validInput({ retailerSlug: "" })).success,
    ).toBe(false);
  });

  it("rejects an unrecognized certification value", () => {
    const result = validateBrandIntake(
      // @ts-expect-error deliberately invalid input for this test
      validInput({ heldCertifications: ["not_a_real_cert"] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a negative dtcAnnualRevenue", () => {
    expect(
      validateBrandIntake(validInput({ dtcAnnualRevenue: -1 })).success,
    ).toBe(false);
  });

  it("rejects a blank brand name or category", () => {
    expect(validateBrandIntake(validInput({ name: "  " })).success).toBe(
      false,
    );
    expect(
      validateBrandIntake(validInput({ category: "" })).success,
    ).toBe(false);
  });
});
