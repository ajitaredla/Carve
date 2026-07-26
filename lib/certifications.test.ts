import { describe, expect, it } from "vitest";
import {
  CERTIFICATION_LABELS,
  CERTIFICATION_OPTIONS,
  CERTIFICATION_ORDER,
} from "./certifications";
import type { Certification } from "@prisma/client";

const EXPECTED_VALUES: readonly Certification[] = [
  "usda_organic",
  "non_gmo",
  "gluten_free",
  "sqf",
  "brc",
];

describe("certifications label map", () => {
  it("covers every Certification enum value exactly once", () => {
    expect(new Set(CERTIFICATION_ORDER)).toEqual(new Set(EXPECTED_VALUES));
    expect(CERTIFICATION_ORDER.length).toBe(EXPECTED_VALUES.length);
  });

  it("has a non-empty human label for every value", () => {
    for (const value of EXPECTED_VALUES) {
      expect(CERTIFICATION_LABELS[value]).toBeTruthy();
      expect(CERTIFICATION_LABELS[value]).not.toMatch(/_/);
    }
  });

  it("CERTIFICATION_OPTIONS is derived consistently from the label map", () => {
    for (const option of CERTIFICATION_OPTIONS) {
      expect(option.label).toBe(CERTIFICATION_LABELS[option.value]);
    }
    expect(CERTIFICATION_OPTIONS).toHaveLength(EXPECTED_VALUES.length);
  });
});
