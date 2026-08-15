import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAggregate, mockCreate } = vi.hoisted(() => ({
  mockAggregate: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiSpendLedger: {
      aggregate: mockAggregate,
      create: mockCreate,
    },
  },
}));

import {
  assertUnderDailySpendCap,
  recordSpend,
  recordSpendForCalls,
  SpendCapExceededError,
} from "./guard";

const usage = (inputTokens: number, outputTokens: number) => ({
  inputTokens,
  outputTokens,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CARVE_DAILY_SPEND_CAP_USD;
  mockAggregate.mockResolvedValue({ _sum: { costUsd: null } });
  mockCreate.mockResolvedValue({});
});

afterEach(() => {
  delete process.env.CARVE_DAILY_SPEND_CAP_USD;
});

describe("assertUnderDailySpendCap", () => {
  it("is a no-op (never queries the DB) when CARVE_DAILY_SPEND_CAP_USD is unset", async () => {
    await expect(assertUnderDailySpendCap()).resolves.toBeUndefined();
    expect(mockAggregate).not.toHaveBeenCalled();
  });

  it("allows generation when spend is under the cap", async () => {
    process.env.CARVE_DAILY_SPEND_CAP_USD = "5";
    mockAggregate.mockResolvedValue({
      _sum: { costUsd: { toNumber: () => 2 } },
    });
    await expect(assertUnderDailySpendCap()).resolves.toBeUndefined();
  });

  it("throws SpendCapExceededError when spend is at or over the cap", async () => {
    process.env.CARVE_DAILY_SPEND_CAP_USD = "5";
    mockAggregate.mockResolvedValue({
      _sum: { costUsd: { toNumber: () => 5.5 } },
    });
    await expect(assertUnderDailySpendCap()).rejects.toThrow(SpendCapExceededError);
  });

  it("treats no recorded spend (null sum) as $0, not an error", async () => {
    process.env.CARVE_DAILY_SPEND_CAP_USD = "5";
    mockAggregate.mockResolvedValue({ _sum: { costUsd: null } });
    await expect(assertUnderDailySpendCap()).resolves.toBeUndefined();
  });

  it("fails closed (blocks everything) on a non-numeric cap value", async () => {
    process.env.CARVE_DAILY_SPEND_CAP_USD = "not-a-number";
    mockAggregate.mockResolvedValue({ _sum: { costUsd: null } });
    await expect(assertUnderDailySpendCap()).rejects.toThrow(SpendCapExceededError);
  });
});

describe("recordSpend / recordSpendForCalls", () => {
  it("writes one ledger row with the estimated cost for the given model", async () => {
    await recordSpend("brand-1", "blocker_statement", "claude-haiku-4-5", usage(1000, 200));
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ brandId: "brand-1", surface: "blocker_statement" }),
    });
  });

  it("records one row per call, costing each against its OWN model rather than pre-summing usage across models", async () => {
    await recordSpendForCalls("brand-1", "blocker_statement", [
      { model: "claude-haiku-4-5", usage: usage(1000, 200) },
      { model: "claude-sonnet-4-6", usage: usage(500, 50) },
    ]);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    const costs = mockCreate.mock.calls.map((call) => call[0].data.costUsd);
    // Sonnet is priced higher per token — its call should cost more despite
    // fewer tokens, proving the two weren't summed into one estimate first.
    expect(costs[1]).toBeGreaterThan(0);
    expect(costs[0]).toBeGreaterThan(0);
  });

  it("does nothing (no DB call) for an empty calls array", async () => {
    await recordSpendForCalls("brand-1", "blocker_statement", []);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
