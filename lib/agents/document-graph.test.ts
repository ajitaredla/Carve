import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock both ./session and ./completeness — document-graph.ts's state machine
// is tested against mocked runGeneratorSession/runVerifierSession/
// sendFollowUp (session.ts) and runCompletenessCheck (completeness.ts), the
// same layering approach generate.test.ts uses for the 2-node graph. Both
// modules are imported eagerly by document-graph.ts, so mocks must be
// declared via vi.hoisted() (see generate.test.ts's own comment on why).
// ---------------------------------------------------------------------------

const {
  mockRunGeneratorSession,
  mockRunVerifierSession,
  mockSendFollowUp,
  mockRunCompletenessCheck,
} = vi.hoisted(() => ({
  mockRunGeneratorSession: vi.fn(),
  mockRunVerifierSession: vi.fn(),
  mockSendFollowUp: vi.fn(),
  mockRunCompletenessCheck: vi.fn(),
}));

vi.mock("./session", () => ({
  runGeneratorSession: mockRunGeneratorSession,
  runVerifierSession: mockRunVerifierSession,
  sendFollowUp: mockSendFollowUp,
}));

vi.mock("./completeness", () => ({
  runCompletenessCheck: mockRunCompletenessCheck,
}));

import { generateDocumentWithChecks, type DocumentGraphOptions } from "./document-graph";

function usage(inputTokens: number, outputTokens: number) {
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

const OPTIONS: DocumentGraphOptions = {
  surface: "kehe_application",
  promptVersion: "v1",
  retailerDataVersion: "2026-07-01T00:00:00.000Z",
  brandInputSnapshot: { brandId: "brand_1" },
};

const factVerifyPrompt = (text: string) => `Verify: ${text}`;

beforeEach(() => {
  vi.clearAllMocks();
  mockRunGeneratorSession.mockResolvedValue({
    text: "generated draft",
    sessionId: "sesn_gen_1",
    usage: usage(100, 50),
  });
});

describe("generateDocumentWithChecks — both checkers pass on attempt 1", () => {
  it("returns final with 3 log entries (generator + fact + completeness), no regeneration", async () => {
    mockRunVerifierSession.mockResolvedValue({
      result: "PASS",
      sessionId: "sesn_verify_1",
      usage: usage(40, 5),
    });
    mockRunCompletenessCheck.mockResolvedValue({
      checkerKind: "completeness",
      verdict: "pass",
    });

    const result = await generateDocumentWithChecks(
      "Write the KeHE application.",
      factVerifyPrompt,
      "kehe_application",
      OPTIONS,
    );

    expect(result.status).toBe("final");
    if (result.status !== "final") throw new Error("unreachable");
    expect(result.text).toBe("generated draft");
    expect(result.canonicalLogEntryIndex).toBe(0);
    expect(result.logEntries).toHaveLength(3);
    expect(result.logEntries[0]).toMatchObject({
      output: "generated draft",
      verificationResult: "pass",
    });
    expect(result.logEntries[1]).toMatchObject({
      checkerKind: "fact",
      attempt: 1,
      verificationResult: "pass",
    });
    expect(result.logEntries[2]).toMatchObject({
      checkerKind: "completeness",
      attempt: 1,
      verificationResult: "pass",
    });
    expect(mockSendFollowUp).not.toHaveBeenCalled();
  });
});

describe("generateDocumentWithChecks — only fact check flags on attempt 1", () => {
  it("regenerates once and returns final after both pass on attempt 2", async () => {
    mockRunVerifierSession
      .mockResolvedValueOnce({
        result: { flagged: "wrong distributor cited." },
        sessionId: "sesn_verify_1",
        usage: usage(40, 10),
      })
      .mockResolvedValueOnce({
        result: "PASS",
        sessionId: "sesn_verify_2",
        usage: usage(45, 6),
      });
    mockRunCompletenessCheck
      .mockResolvedValueOnce({ checkerKind: "completeness", verdict: "pass" })
      .mockResolvedValueOnce({ checkerKind: "completeness", verdict: "pass" });
    mockSendFollowUp.mockResolvedValue({
      text: "corrected draft",
      usage: usage(60, 30),
    });

    const result = await generateDocumentWithChecks(
      "Write the KeHE application.",
      factVerifyPrompt,
      "kehe_application",
      OPTIONS,
    );

    expect(result.status).toBe("final");
    if (result.status !== "final") throw new Error("unreachable");
    expect(result.text).toBe("corrected draft");
    expect(result.canonicalLogEntryIndex).toBe(3);
    expect(result.logEntries).toHaveLength(6);
    expect(mockSendFollowUp).toHaveBeenCalledTimes(1);
    expect(mockSendFollowUp).toHaveBeenCalledWith(
      "sesn_gen_1",
      expect.stringContaining("wrong distributor cited."),
    );
  });
});

describe("generateDocumentWithChecks — only completeness flags on attempt 1", () => {
  it("regenerates once, feeding the completeness discrepancy back", async () => {
    mockRunVerifierSession.mockResolvedValue({
      result: "PASS",
      sessionId: "sesn_verify_1",
      usage: usage(40, 5),
    });
    mockRunCompletenessCheck
      .mockResolvedValueOnce({
        checkerKind: "completeness",
        verdict: "flagged",
        discrepancy: "missing a subject line",
      })
      .mockResolvedValueOnce({ checkerKind: "completeness", verdict: "pass" });
    mockSendFollowUp.mockResolvedValue({
      text: "corrected draft with subject line",
      usage: usage(60, 30),
    });

    const result = await generateDocumentWithChecks(
      "Write the KeHE application.",
      factVerifyPrompt,
      "kehe_application",
      OPTIONS,
    );

    expect(result.status).toBe("final");
    expect(mockSendFollowUp).toHaveBeenCalledWith(
      "sesn_gen_1",
      expect.stringContaining("missing a subject line"),
    );
  });
});

describe("generateDocumentWithChecks — both flag on attempt 1, both pass on attempt 2", () => {
  it("combines both discrepancies into the single regeneration message", async () => {
    mockRunVerifierSession
      .mockResolvedValueOnce({
        result: { flagged: "wrong margin figure." },
        sessionId: "sesn_verify_1",
        usage: usage(40, 10),
      })
      .mockResolvedValueOnce({
        result: "PASS",
        sessionId: "sesn_verify_2",
        usage: usage(45, 6),
      });
    mockRunCompletenessCheck
      .mockResolvedValueOnce({
        checkerKind: "completeness",
        verdict: "flagged",
        discrepancy: "missing a subject line",
      })
      .mockResolvedValueOnce({ checkerKind: "completeness", verdict: "pass" });
    mockSendFollowUp.mockResolvedValue({
      text: "fully corrected draft",
      usage: usage(60, 30),
    });

    const result = await generateDocumentWithChecks(
      "Write the KeHE application.",
      factVerifyPrompt,
      "kehe_application",
      OPTIONS,
    );

    expect(result.status).toBe("final");
    const followUpMessage = mockSendFollowUp.mock.calls[0][1] as string;
    expect(followUpMessage).toContain("wrong margin figure.");
    expect(followUpMessage).toContain("missing a subject line");
  });
});

describe("generateDocumentWithChecks — ASYMMETRIC flagged-twice: fact flags attempt 1, completeness flags attempt 2", () => {
  it("never attempts a 3rd generation, and returns needs_review with only the CURRENT (attempt-2) discrepancy", async () => {
    mockRunVerifierSession
      .mockResolvedValueOnce({
        result: { flagged: "wrong margin figure." },
        sessionId: "sesn_verify_1",
        usage: usage(40, 10),
      })
      .mockResolvedValueOnce({
        result: "PASS",
        sessionId: "sesn_verify_2",
        usage: usage(45, 6),
      });
    mockRunCompletenessCheck
      .mockResolvedValueOnce({ checkerKind: "completeness", verdict: "pass" })
      .mockResolvedValueOnce({
        checkerKind: "completeness",
        verdict: "flagged",
        discrepancy: "still missing a subject line",
      });
    mockSendFollowUp.mockResolvedValue({
      text: "margin corrected, but still no subject line",
      usage: usage(60, 30),
    });

    const result = await generateDocumentWithChecks(
      "Write the KeHE application.",
      factVerifyPrompt,
      "kehe_application",
      OPTIONS,
    );

    expect(result.status).toBe("needs_review");
    if (result.status !== "needs_review") throw new Error("unreachable");

    // The founder-facing message must reflect attempt 2's actual problem,
    // not attempt 1's already-resolved one.
    expect(result.discrepancy).toContain("still missing a subject line");
    expect(result.discrepancy).not.toContain("wrong margin figure");
    expect(result.discrepancies.completeness).toBe("still missing a subject line");
    expect(result.discrepancies.fact).toBeUndefined();

    // Exactly one regeneration attempt, ever.
    expect(mockRunGeneratorSession).toHaveBeenCalledTimes(1);
    expect(mockSendFollowUp).toHaveBeenCalledTimes(1);
    expect(mockRunVerifierSession).toHaveBeenCalledTimes(2);
    expect(mockRunCompletenessCheck).toHaveBeenCalledTimes(2);

    expect(result.logEntries).toHaveLength(6);
    expect(result.logEntries.filter((e) => e.checkerKind === "fact")).toHaveLength(2);
    expect(result.logEntries.filter((e) => e.checkerKind === "completeness")).toHaveLength(2);
    const attempt2Entries = result.logEntries.filter((e) => e.attempt === 2);
    expect(attempt2Entries).toHaveLength(2);
  });
});

describe("generateDocumentWithChecks — session-level failures propagate", () => {
  it("does not catch a thrown error from runGeneratorSession", async () => {
    class FakeAgentSessionError extends Error {}
    mockRunGeneratorSession.mockRejectedValue(
      new FakeAgentSessionError("session terminated"),
    );

    await expect(
      generateDocumentWithChecks(
        "prompt",
        factVerifyPrompt,
        "kehe_application",
        OPTIONS,
      ),
    ).rejects.toThrow("session terminated");

    expect(mockRunVerifierSession).not.toHaveBeenCalled();
    expect(mockRunCompletenessCheck).not.toHaveBeenCalled();
  });

  it("does not catch a thrown error from runCompletenessCheck", async () => {
    mockRunVerifierSession.mockResolvedValue({
      result: "PASS",
      sessionId: "sesn_verify_1",
      usage: usage(40, 5),
    });
    mockRunCompletenessCheck.mockRejectedValue(
      new Error("completeness check failed"),
    );

    await expect(
      generateDocumentWithChecks(
        "prompt",
        factVerifyPrompt,
        "kehe_application",
        OPTIONS,
      ),
    ).rejects.toThrow("completeness check failed");
  });
});
