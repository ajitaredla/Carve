import { describe, expect, it } from "vitest";
import {
  DIMENSION_DISPLAY_INFO,
  DIMENSION_LABELS,
} from "./dimension-labels";
import { DIMENSION_ORDER, DIMENSION_WEIGHTS } from "./types";

describe("dimension display labels", () => {
  it("has a label for every DimensionKey in DIMENSION_ORDER", () => {
    for (const key of DIMENSION_ORDER) {
      expect(DIMENSION_LABELS[key]).toBeTruthy();
    }
    expect(Object.keys(DIMENSION_LABELS).sort()).toEqual(
      [...DIMENSION_ORDER].sort(),
    );
  });

  it("DIMENSION_DISPLAY_INFO carries the correct weight for each dimension", () => {
    for (const info of DIMENSION_DISPLAY_INFO) {
      expect(info.weight).toBe(DIMENSION_WEIGHTS[info.key]);
      expect(info.label).toBe(DIMENSION_LABELS[info.key]);
    }
  });

  it("weights still sum to 100 (guards against label file drifting from types.ts)", () => {
    const total = DIMENSION_DISPLAY_INFO.reduce(
      (sum, info) => sum + info.weight,
      0,
    );
    expect(total).toBe(100);
  });
});
