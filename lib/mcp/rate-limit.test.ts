import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkMcpRateLimit, resetMcpRateLimitForTesting } from "./rate-limit";

beforeEach(() => {
  resetMcpRateLimitForTesting();
  delete process.env.CARVE_MCP_RATE_LIMIT_PER_MIN;
});

afterEach(() => {
  resetMcpRateLimitForTesting();
  delete process.env.CARVE_MCP_RATE_LIMIT_PER_MIN;
});

describe("checkMcpRateLimit", () => {
  it("allows unlimited requests when CARVE_MCP_RATE_LIMIT_PER_MIN is unset", () => {
    for (let i = 0; i < 500; i++) {
      expect(checkMcpRateLimit(0)).toBe(true);
    }
  });

  it("allows requests up to the configured limit, then blocks", () => {
    process.env.CARVE_MCP_RATE_LIMIT_PER_MIN = "3";
    expect(checkMcpRateLimit(0)).toBe(true);
    expect(checkMcpRateLimit(0)).toBe(true);
    expect(checkMcpRateLimit(0)).toBe(true);
    expect(checkMcpRateLimit(0)).toBe(false);
  });

  it("resets the count once the window rolls over", () => {
    process.env.CARVE_MCP_RATE_LIMIT_PER_MIN = "2";
    expect(checkMcpRateLimit(0)).toBe(true);
    expect(checkMcpRateLimit(0)).toBe(true);
    expect(checkMcpRateLimit(0)).toBe(false);

    // 60_001ms later — a new window.
    expect(checkMcpRateLimit(60_001)).toBe(true);
    expect(checkMcpRateLimit(60_001)).toBe(true);
    expect(checkMcpRateLimit(60_001)).toBe(false);
  });

  it("fails closed (limit of 0) on a non-numeric env value", () => {
    process.env.CARVE_MCP_RATE_LIMIT_PER_MIN = "not-a-number";
    expect(checkMcpRateLimit(0)).toBe(false);
  });
});
