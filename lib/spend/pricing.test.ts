import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "./pricing";

const usage = (inputTokens: number, outputTokens: number) => ({
  inputTokens,
  outputTokens,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
});

describe("estimateCostUsd", () => {
  it("prices claude-haiku-4-5 at $1/$5 per M input/output tokens", () => {
    const cost = estimateCostUsd("claude-haiku-4-5", usage(1_000_000, 1_000_000));
    expect(cost).toBeCloseTo(1 + 5, 6);
  });

  it("prices claude-sonnet-4-6 at $3/$15 per M input/output tokens", () => {
    const cost = estimateCostUsd("claude-sonnet-4-6", usage(1_000_000, 1_000_000));
    expect(cost).toBeCloseTo(3 + 15, 6);
  });

  it("prices claude-sonnet-4-6 higher than claude-haiku-4-5 for identical usage", () => {
    const identical = usage(1000, 200);
    const haikuCost = estimateCostUsd("claude-haiku-4-5", identical);
    const sonnetCost = estimateCostUsd("claude-sonnet-4-6", identical);
    expect(sonnetCost).toBeGreaterThan(haikuCost);
  });

  it("includes cache read/creation tokens in the estimate", () => {
    const withoutCache = estimateCostUsd("claude-haiku-4-5", usage(100, 20));
    const withCache = estimateCostUsd("claude-haiku-4-5", {
      inputTokens: 100,
      outputTokens: 20,
      cacheCreationInputTokens: 1000,
      cacheReadInputTokens: 1000,
    });
    expect(withCache).toBeGreaterThan(withoutCache);
  });

  it("returns 0 for an unrecognized model rather than throwing", () => {
    expect(estimateCostUsd("some-future-model", usage(1000, 1000))).toBe(0);
  });
});
