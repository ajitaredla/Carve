import { describe, expect, it } from "vitest";
import { isNotReadyForRetailer, NOT_READY_SCORE_THRESHOLD } from "./not-ready";

describe("isNotReadyForRetailer (FR-06)", () => {
  it("is not ready strictly below the threshold", () => {
    expect(isNotReadyForRetailer(NOT_READY_SCORE_THRESHOLD - 1)).toBe(true);
    expect(isNotReadyForRetailer(0)).toBe(true);
  });

  it("is ready at and above the threshold", () => {
    expect(isNotReadyForRetailer(NOT_READY_SCORE_THRESHOLD)).toBe(false);
    expect(isNotReadyForRetailer(100)).toBe(false);
  });

  it("threshold is exactly 40 per FR-06", () => {
    expect(NOT_READY_SCORE_THRESHOLD).toBe(40);
  });
});
