import { describe, expect, it, vi } from "vitest";
import { toFriendlyGenerationError } from "./friendly";
import { AgentSessionError } from "@/lib/agents/session";
import { ScoringInputMappingError } from "@/lib/scoring/map-retailer-requirements";
import { WaterfallInputError } from "@/lib/waterfall/calculator";

describe("toFriendlyGenerationError", () => {
  it("returns a short, generic session message for AgentSessionError without leaking internals", () => {
    const error = new AgentSessionError("retries_exhausted: sesn_abc123", "sesn_abc123");
    const result = toFriendlyGenerationError(error, "test");
    expect(result.message).not.toContain("sesn_abc123");
    expect(result.message.toLowerCase()).toContain("try again");
  });

  it("surfaces ScoringInputMappingError's own structured message (already founder-safe)", () => {
    const error = new ScoringInputMappingError("retailPrice must be greater than 0.");
    const result = toFriendlyGenerationError(error, "test");
    expect(result.message).toContain("retailPrice must be greater than 0.");
    expect(result.message).toMatch(/couldn't score/i);
  });

  it("surfaces WaterfallInputError's own structured message", () => {
    const error = new WaterfallInputError("msrp must be greater than 0.");
    const result = toFriendlyGenerationError(error, "test");
    expect(result.message).toContain("msrp must be greater than 0.");
    expect(result.message).toMatch(/couldn't calculate the waterfall/i);
  });

  it("sanitizes unrecognized errors and logs the real message server-side", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill in...",
    );
    const result = toFriendlyGenerationError(error, "someContext");

    expect(result.message).not.toContain("DATABASE_URL");
    expect(result.message).not.toContain(".env.example");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("someContext"),
      error,
    );

    consoleSpy.mockRestore();
  });

  it("sanitizes non-Error thrown values too", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = toFriendlyGenerationError("a raw string throw", "ctx");
    expect(result.message).toBe(
      "Something went wrong while processing this request. Please try again, and contact support if it keeps happening.",
    );
    consoleSpy.mockRestore();
  });
});
