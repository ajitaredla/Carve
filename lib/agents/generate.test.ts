import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock lib/agents/session.ts entirely — generate.ts's state machine is
// tested against mocked runGeneratorSession/runVerifierSession/sendFollowUp.
//
// Unlike session.test.ts (which mocks "@anthropic-ai/sdk" but only ever
// constructs the client lazily, inside a test body), generate.ts imports
// runGeneratorSession/runVerifierSession/sendFollowUp EAGERLY at module load
// time. `vi.mock`'s factory runs as soon as that import is evaluated —
// before this file's own top-level `const` statements would otherwise run —
// so the mock functions must be declared via `vi.hoisted()`, which hoists
// their initialization together with `vi.mock` itself. A plain `const
// mockX = vi.fn()` above `vi.mock(...)` hits a TDZ ReferenceError here.
// ---------------------------------------------------------------------------

const { mockRunGeneratorSession, mockRunVerifierSession, mockSendFollowUp } =
  vi.hoisted(() => ({
    mockRunGeneratorSession: vi.fn(),
    mockRunVerifierSession: vi.fn(),
    mockSendFollowUp: vi.fn(),
  }));

vi.mock("./session", () => ({
  runGeneratorSession: mockRunGeneratorSession,
  runVerifierSession: mockRunVerifierSession,
  sendFollowUp: mockSendFollowUp,
}));

import {
  generateWithVerification,
  persistGenerationLogs,
  GENERATION_MODEL,
  type GenerateWithVerificationOptions,
} from "./generate";

function usage(inputTokens: number, outputTokens: number) {
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

const OPTIONS: GenerateWithVerificationOptions = {
  surface: "blocker_statement",
  promptVersion: "v1",
  retailerDataVersion: "2026-07-01T00:00:00.000Z",
  brandInputSnapshot: { brandId: "brand_1", wholesalePrice: 4.5 },
};

const verifyPrompt = (text: string) => `Verify: ${text}`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateWithVerification — PASS on first try", () => {
  it("returns status: final after a single generate+verify pass, with 2 log entries", async () => {
    mockRunGeneratorSession.mockResolvedValue({
      text: "Your $4.50 wholesale gives Sprouts 55% margin.",
      sessionId: "sesn_gen_1",
      usage: usage(100, 50),
    });
    mockRunVerifierSession.mockResolvedValue({
      result: "PASS",
      sessionId: "sesn_verify_1",
      usage: usage(40, 5),
    });

    const result = await generateWithVerification(
      "Write the blocker statement.",
      verifyPrompt,
      OPTIONS,
    );

    expect(result.status).toBe("final");
    if (result.status !== "final") throw new Error("unreachable");

    expect(result.text).toBe(
      "Your $4.50 wholesale gives Sprouts 55% margin.",
    );
    expect(result.generatorSessionId).toBe("sesn_gen_1");
    expect(result.verifierSessionId).toBe("sesn_verify_1");
    expect(result.canonicalLogEntryIndex).toBe(0);
    expect(result.logEntries).toHaveLength(2);
    expect(result.logEntries[0]).toMatchObject({
      surface: "blocker_statement",
      promptVersion: "v1",
      retailerDataVersion: "2026-07-01T00:00:00.000Z",
      model: GENERATION_MODEL,
      output: "Your $4.50 wholesale gives Sprouts 55% margin.",
      verificationResult: "pass",
    });
    expect(result.logEntries[1]).toMatchObject({
      output: "PASS",
      verificationResult: "pass",
    });

    // Never called on the happy path — no regeneration.
    expect(mockSendFollowUp).not.toHaveBeenCalled();
    expect(mockRunVerifierSession).toHaveBeenCalledTimes(1);
  });
});

describe("generateWithVerification — FLAGGED then PASS on retry", () => {
  it("sends the exact discrepancy into a follow-up, re-verifies with a NEW verifier session, and returns final", async () => {
    mockRunGeneratorSession.mockResolvedValue({
      text: "Draft claiming a 42% minimum margin.",
      sessionId: "sesn_gen_1",
      usage: usage(100, 50),
    });
    mockRunVerifierSession
      .mockResolvedValueOnce({
        result: { flagged: "text states 42% minimum but tool returned 40%." },
        sessionId: "sesn_verify_1",
        usage: usage(40, 10),
      })
      .mockResolvedValueOnce({
        result: "PASS",
        sessionId: "sesn_verify_2",
        usage: usage(45, 6),
      });
    mockSendFollowUp.mockResolvedValue({
      text: "Corrected draft citing the real 40% minimum margin.",
      usage: usage(60, 30),
    });

    const result = await generateWithVerification(
      "Write the blocker statement.",
      verifyPrompt,
      OPTIONS,
    );

    expect(result.status).toBe("final");
    if (result.status !== "final") throw new Error("unreachable");

    expect(result.text).toBe(
      "Corrected draft citing the real 40% minimum margin.",
    );
    // Regeneration continues the SAME generator session id.
    expect(result.generatorSessionId).toBe("sesn_gen_1");
    expect(result.verifierSessionId).toBe("sesn_verify_2");
    expect(result.canonicalLogEntryIndex).toBe(2);

    expect(mockSendFollowUp).toHaveBeenCalledTimes(1);
    expect(mockSendFollowUp).toHaveBeenCalledWith(
      "sesn_gen_1",
      expect.stringContaining(
        "text states 42% minimum but tool returned 40%.",
      ),
    );
    expect(mockSendFollowUp.mock.calls[0][1]).toContain(
      "Your previous attempt was flagged:",
    );

    // A fresh, independent verifier session for the re-check.
    expect(mockRunVerifierSession).toHaveBeenCalledTimes(2);

    expect(result.logEntries).toHaveLength(4);
    expect(result.logEntries[0]).toMatchObject({
      output: "Draft claiming a 42% minimum margin.",
      verificationResult: "regenerated",
    });
    expect(result.logEntries[1]).toMatchObject({
      output: "FLAGGED: text states 42% minimum but tool returned 40%.",
      verificationResult: "flagged",
    });
    expect(result.logEntries[2]).toMatchObject({
      output: "Corrected draft citing the real 40% minimum margin.",
      verificationResult: "pass",
    });
    expect(result.logEntries[3]).toMatchObject({
      output: "PASS",
      verificationResult: "pass",
    });
  });
});

describe("generateWithVerification — FLAGGED twice -> needs_review", () => {
  it("never attempts a third generation; returns needs_review with the second discrepancy", async () => {
    mockRunGeneratorSession.mockResolvedValue({
      text: "Draft claiming a 42% minimum margin.",
      sessionId: "sesn_gen_1",
      usage: usage(100, 50),
    });
    mockRunVerifierSession
      .mockResolvedValueOnce({
        result: { flagged: "first discrepancy." },
        sessionId: "sesn_verify_1",
        usage: usage(40, 10),
      })
      .mockResolvedValueOnce({
        result: { flagged: "still wrong: second discrepancy." },
        sessionId: "sesn_verify_2",
        usage: usage(45, 12),
      });
    mockSendFollowUp.mockResolvedValue({
      text: "Still-incorrect corrected draft.",
      usage: usage(60, 30),
    });

    const result = await generateWithVerification(
      "Write the blocker statement.",
      verifyPrompt,
      OPTIONS,
    );

    expect(result.status).toBe("needs_review");
    if (result.status !== "needs_review") throw new Error("unreachable");

    expect(result.lastDiscrepancy).toBe("still wrong: second discrepancy.");

    // Exactly one regeneration attempt — never a third generator call.
    expect(mockRunGeneratorSession).toHaveBeenCalledTimes(1);
    expect(mockSendFollowUp).toHaveBeenCalledTimes(1);
    expect(mockRunVerifierSession).toHaveBeenCalledTimes(2);

    expect(result.logEntries).toHaveLength(4);
    expect(result.logEntries[0]).toMatchObject({
      output: "Draft claiming a 42% minimum margin.",
      verificationResult: "regenerated",
    });
    expect(result.logEntries[1]).toMatchObject({
      output: "FLAGGED: first discrepancy.",
      verificationResult: "flagged",
    });
    expect(result.logEntries[2]).toMatchObject({
      output: "Still-incorrect corrected draft.",
      verificationResult: "failed",
    });
    expect(result.logEntries[3]).toMatchObject({
      output: "FLAGGED: still wrong: second discrepancy.",
      verificationResult: "flagged",
    });

    // needs_review carries no canonicalLogEntryIndex / persisted text.
    expect(result).not.toHaveProperty("canonicalLogEntryIndex");
    expect(result).not.toHaveProperty("text");
  });
});

describe("generateWithVerification — session-level failures propagate", () => {
  it("does not catch a thrown AgentSessionError from runGeneratorSession", async () => {
    class FakeAgentSessionError extends Error {}
    mockRunGeneratorSession.mockRejectedValue(
      new FakeAgentSessionError("session terminated"),
    );

    await expect(
      generateWithVerification("prompt", verifyPrompt, OPTIONS),
    ).rejects.toThrow("session terminated");

    expect(mockRunVerifierSession).not.toHaveBeenCalled();
  });
});

describe("persistGenerationLogs", () => {
  it("writes every entry in order, linked to the given assessmentId/costWaterfallId", async () => {
    const created = [{ id: "log_1" }, { id: "log_2" }];
    const create = vi
      .fn()
      .mockResolvedValueOnce(created[0])
      .mockResolvedValueOnce(created[1]);
    const db = { generationLog: { create } };

    const entries = [
      {
        surface: "blocker_statement" as const,
        promptVersion: "v1",
        retailerDataVersion: "v1-data",
        brandInputSnapshot: { a: 1 },
        model: GENERATION_MODEL,
        output: "text 1",
        verificationResult: "pass" as const,
      },
      {
        surface: "blocker_statement" as const,
        promptVersion: "v1",
        retailerDataVersion: "v1-data",
        brandInputSnapshot: { a: 1 },
        model: GENERATION_MODEL,
        output: "PASS",
        verificationResult: "pass" as const,
      },
    ];

    const result = await persistGenerationLogs(db, entries, {
      assessmentId: "assessment_1",
    });

    expect(result).toEqual(created);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        output: "text 1",
        assessmentId: "assessment_1",
        costWaterfallId: undefined,
      }),
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        output: "PASS",
        assessmentId: "assessment_1",
      }),
    });
  });

  it("supports linking to a costWaterfallId instead", async () => {
    const create = vi.fn().mockResolvedValue({ id: "log_1" });
    const db = { generationLog: { create } };

    await persistGenerationLogs(
      db,
      [
        {
          surface: "waterfall_verdict",
          promptVersion: "v1",
          retailerDataVersion: "v1-data",
          brandInputSnapshot: {},
          model: GENERATION_MODEL,
          output: "verdict text",
          verificationResult: "pass",
        },
      ],
      { costWaterfallId: "waterfall_1" },
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        costWaterfallId: "waterfall_1",
        assessmentId: undefined,
      }),
    });
  });
});
