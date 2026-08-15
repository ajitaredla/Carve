import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCount } = vi.hoisted(() => ({ mockCount: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generationLog: { count: mockCount },
  },
}));

import {
  assertUnderGenerationRateLimit,
  GenerationRateLimitExceededError,
} from "./generation";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CARVE_FOUNDER_HOURLY_GENERATION_LIMIT;
  mockCount.mockResolvedValue(0);
});

afterEach(() => {
  delete process.env.CARVE_FOUNDER_HOURLY_GENERATION_LIMIT;
});

describe("assertUnderGenerationRateLimit", () => {
  it("is a no-op (never queries the DB) when the env var is unset", async () => {
    await expect(assertUnderGenerationRateLimit("brand-1")).resolves.toBeUndefined();
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("allows generation when under the hourly limit", async () => {
    process.env.CARVE_FOUNDER_HOURLY_GENERATION_LIMIT = "10";
    mockCount.mockResolvedValue(3);
    await expect(assertUnderGenerationRateLimit("brand-1")).resolves.toBeUndefined();
  });

  it("throws GenerationRateLimitExceededError at or over the limit", async () => {
    process.env.CARVE_FOUNDER_HOURLY_GENERATION_LIMIT = "10";
    mockCount.mockResolvedValue(10);
    await expect(assertUnderGenerationRateLimit("brand-1")).rejects.toThrow(
      GenerationRateLimitExceededError,
    );
  });

  it("scopes the count query to the given brandId via the Assessment relation", async () => {
    process.env.CARVE_FOUNDER_HOURLY_GENERATION_LIMIT = "10";
    mockCount.mockResolvedValue(0);
    await assertUnderGenerationRateLimit("brand-42");
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assessment: { brandId: "brand-42" },
        }),
      }),
    );
  });

  it("fails closed (limit of 0) on a non-numeric env value", async () => {
    process.env.CARVE_FOUNDER_HOURLY_GENERATION_LIMIT = "not-a-number";
    mockCount.mockResolvedValue(0);
    await expect(assertUnderGenerationRateLimit("brand-1")).rejects.toThrow(
      GenerationRateLimitExceededError,
    );
  });
});
