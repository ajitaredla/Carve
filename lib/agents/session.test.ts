import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk — this file drives lib/agents/session.ts entirely
// against mocked client.beta.sessions.* calls (per task 6.1's instructions:
// this environment cannot run a real end-to-end Managed Agents session).
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();
const mockStream = vi.fn();
const mockSend = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    beta = {
      sessions: {
        create: mockCreate,
        events: {
          stream: mockStream,
          send: mockSend,
        },
      },
    };
  }
  return { default: MockAnthropic };
});

import {
  AgentSessionError,
  runGeneratorSession,
  runVerifierSession,
  sendFollowUp,
} from "./session";

/** Builds a mock async-iterable stream from a fixed array of events —
 * stands in for the real `Stream<BetaManagedAgentsStreamSessionEvents>`. */
function mockEventStream(events: unknown[]) {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next: async () => {
          if (index < events.length) {
            return { value: events[index++], done: false as const };
          }
          return { value: undefined, done: true as const };
        },
      };
    },
  };
}

function agentMessage(text: string) {
  return {
    id: "sevt_msg",
    type: "agent.message",
    content: [{ type: "text", text }],
    processed_at: "2026-07-25T00:00:00.000Z",
  };
}

function modelRequestEnd(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}) {
  return {
    id: "sevt_span_end",
    type: "span.model_request_end",
    model_request_start_id: "sevt_span_start",
    is_error: false,
    model_usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    },
    processed_at: "2026-07-25T00:00:01.000Z",
  };
}

function idleEndTurn() {
  return {
    id: "sevt_idle",
    type: "session.status_idle",
    stop_reason: { type: "end_turn" },
    processed_at: "2026-07-25T00:00:02.000Z",
  };
}

function idleRetriesExhausted() {
  return {
    id: "sevt_idle_re",
    type: "session.status_idle",
    stop_reason: { type: "retries_exhausted" },
    processed_at: "2026-07-25T00:00:02.000Z",
  };
}

function sessionError() {
  return {
    id: "sevt_err",
    type: "session.error",
    error: { type: "mcp_connection_failed_error", mcp_server_name: "carve-data", message: "connection reset", retry_status: { type: "retrying" } },
    processed_at: "2026-07-25T00:00:00.500Z",
  };
}

function sessionTerminated() {
  return {
    id: "sevt_term",
    type: "session.status_terminated",
    processed_at: "2026-07-25T00:00:03.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CARVE_ENVIRONMENT_ID = "env_test";
  process.env.CARVE_GENERATOR_AGENT_ID = "agent_generator_test";
  process.env.CARVE_VERIFIER_AGENT_ID = "agent_verifier_test";
  process.env.CARVE_VAULT_ID = "vlt_test";
  // Every test in this file up to the "CARVE_MOCK_AGENTS mock seam" describe
  // block below exercises the REAL implementation (against the mocked SDK
  // above) — make sure the mock seam is never accidentally left on from a
  // prior test.
  delete process.env.CARVE_MOCK_AGENTS;

  mockCreate.mockResolvedValue({ id: "sesn_test" });
  mockSend.mockResolvedValue({ data: [] });
});

describe("runGeneratorSession — happy path", () => {
  it("creates a session, streams to idle/end_turn, and extracts text + sessionId + usage", async () => {
    mockStream.mockResolvedValue(
      mockEventStream([
        agentMessage("Here is your KeHE application draft."),
        modelRequestEnd({ input_tokens: 100, output_tokens: 50 }),
        idleEndTurn(),
      ]),
    );

    const result = await runGeneratorSession("Write a KeHE application.");

    expect(result).toEqual({
      text: "Here is your KeHE application draft.",
      sessionId: "sesn_test",
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
    });

    // vault_ids passed at create-time (5.8's review note (a)).
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "agent_generator_test",
        environment_id: "env_test",
        vault_ids: ["vlt_test"],
      }),
    );

    // Stream-first ordering: stream() must be invoked before send().
    const streamOrder = mockStream.mock.invocationCallOrder[0];
    const sendOrder = mockSend.mock.invocationCallOrder[0];
    expect(streamOrder).toBeLessThan(sendOrder);
  });

  it("sums usage across multiple model requests within one turn", async () => {
    mockStream.mockResolvedValue(
      mockEventStream([
        modelRequestEnd({ input_tokens: 10, output_tokens: 5 }),
        modelRequestEnd({ input_tokens: 20, output_tokens: 8, cache_read_input_tokens: 4 }),
        agentMessage("Final answer."),
        idleEndTurn(),
      ]),
    );

    const result = await runGeneratorSession("prompt");

    expect(result.usage).toEqual({
      inputTokens: 30,
      outputTokens: 13,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 4,
    });
  });
});

describe("runVerifierSession — result parsing", () => {
  it("parses a PASS response", async () => {
    mockStream.mockResolvedValue(
      mockEventStream([
        agentMessage("PASS"),
        modelRequestEnd({ input_tokens: 40, output_tokens: 2 }),
        idleEndTurn(),
      ]),
    );

    const result = await runVerifierSession("Verify this content.");
    expect(result.result).toBe("PASS");
    expect(result.sessionId).toBe("sesn_test");
  });

  it("parses a FLAGGED response into { flagged: <discrepancy> }", async () => {
    mockStream.mockResolvedValue(
      mockEventStream([
        agentMessage(
          "FLAGGED: text states a 42% minimum margin but get_retailer_requirements returned 40%.",
        ),
        idleEndTurn(),
      ]),
    );

    const result = await runVerifierSession("Verify this content.");
    expect(result.result).toEqual({
      flagged:
        "text states a 42% minimum margin but get_retailer_requirements returned 40%.",
    });
  });

  it("throws AgentSessionError on an unexpected output shape (not PASS or FLAGGED:)", async () => {
    mockStream.mockResolvedValue(
      mockEventStream([agentMessage("Looks good to me!"), idleEndTurn()]),
    );

    await expect(runVerifierSession("Verify this content.")).rejects.toThrow(
      AgentSessionError,
    );
  });

  it("throws AgentSessionError on a bare 'FLAGGED:' with no discrepancy text", async () => {
    mockStream.mockResolvedValue(
      mockEventStream([agentMessage("FLAGGED:"), idleEndTurn()]),
    );

    await expect(runVerifierSession("Verify this content.")).rejects.toThrow(
      AgentSessionError,
    );
  });
});

describe("session.error handling", () => {
  it("does not fail the call when a session.error event occurs during an otherwise-successful run", async () => {
    mockStream.mockResolvedValue(
      mockEventStream([
        sessionError(),
        agentMessage("Recovered and produced a normal PASS."),
        idleEndTurn(),
      ]),
    );

    // Verifier text isn't "PASS" exactly, so use the generator to isolate
    // just the session.error-tolerance behavior from result parsing.
    const result = await runGeneratorSession("prompt");
    expect(result.text).toBe("Recovered and produced a normal PASS.");
  });
});

describe("session-level failures", () => {
  it("throws AgentSessionError when the session terminates before completing", async () => {
    mockStream.mockResolvedValue(mockEventStream([sessionTerminated()]));

    await expect(runGeneratorSession("prompt")).rejects.toThrow(
      AgentSessionError,
    );
  });

  it("throws AgentSessionError when the session goes idle with retries_exhausted", async () => {
    mockStream.mockResolvedValue(mockEventStream([idleRetriesExhausted()]));

    await expect(runGeneratorSession("prompt")).rejects.toThrow(
      AgentSessionError,
    );
  });

  it("throws AgentSessionError when the stream ends without a terminal event", async () => {
    mockStream.mockResolvedValue(
      mockEventStream([agentMessage("partial, then the connection drops")]),
    );

    await expect(runGeneratorSession("prompt")).rejects.toThrow(
      AgentSessionError,
    );
  });

  it("throws AgentSessionError on an unresolved requires_action idle", async () => {
    mockStream.mockResolvedValue(
      mockEventStream([
        {
          id: "sevt_idle_ra",
          type: "session.status_idle",
          stop_reason: { type: "requires_action", event_ids: ["sevt_tool"] },
          processed_at: "2026-07-25T00:00:02.000Z",
        },
      ]),
    );

    await expect(runGeneratorSession("prompt")).rejects.toThrow(
      AgentSessionError,
    );
  });
});

describe("sendFollowUp — 6.1a continuation", () => {
  it("sends a follow-up user.message into an existing session and drains to completion", async () => {
    mockStream.mockResolvedValue(
      mockEventStream([
        agentMessage("Corrected draft addressing the flagged discrepancy."),
        modelRequestEnd({ input_tokens: 60, output_tokens: 30 }),
        idleEndTurn(),
      ]),
    );

    const result = await sendFollowUp(
      "sesn_existing",
      "FLAGGED: the margin figure doesn't match. Please correct it.",
    );

    expect(result.text).toBe("Corrected draft addressing the flagged discrepancy.");
    expect(result.usage.inputTokens).toBe(60);

    // Continues the SAME session — no new sessions.create() call.
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockStream).toHaveBeenCalledWith("sesn_existing");
    expect(mockSend).toHaveBeenCalledWith(
      "sesn_existing",
      expect.objectContaining({
        events: [
          expect.objectContaining({
            type: "user.message",
            content: [{ type: "text", text: expect.stringContaining("FLAGGED") }],
          }),
        ],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Task 7.0a — CARVE_MOCK_AGENTS=1 mock seam.
//
// These tests set the flag themselves and clean it up afterward (the shared
// beforeEach above deletes it before every test, including these, so each
// test here explicitly opts in). Crucially: every test in this block also
// asserts the mocked SDK (mockCreate/mockStream/mockSend) is NEVER touched —
// that's the "zero-risk to production, real path untouched" guarantee.
// ---------------------------------------------------------------------------

describe("CARVE_MOCK_AGENTS mock seam", () => {
  afterEach(() => {
    delete process.env.CARVE_MOCK_AGENTS;
  });

  describe("runGeneratorSession", () => {
    it("returns a canned PASS-path result for a marker-free prompt, without touching the real SDK", async () => {
      process.env.CARVE_MOCK_AGENTS = "1";

      const result = await runGeneratorSession("Write a KeHE application.");

      expect(result.sessionId).toMatch(/^sesn_mock_/);
      expect(result.text).toContain("MOCK");
      expect(result.text).not.toContain("MOCK_FLAG_ME");
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);

      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockStream).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("embeds the MOCK_FLAG_ME marker in its output when the prompt contains it", async () => {
      process.env.CARVE_MOCK_AGENTS = "1";

      const result = await runGeneratorSession(
        "Write a KeHE application. MOCK_FLAG_ME",
      );

      expect(result.text).toContain("MOCK_FLAG_ME");
    });

    it("throws AgentSessionError when the prompt contains MOCK_ERROR_ME", async () => {
      process.env.CARVE_MOCK_AGENTS = "1";

      await expect(
        runGeneratorSession("Write a KeHE application. MOCK_ERROR_ME"),
      ).rejects.toThrow(AgentSessionError);

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("runVerifierSession", () => {
    it("returns PASS for marker-free content", async () => {
      process.env.CARVE_MOCK_AGENTS = "1";

      const result = await runVerifierSession("Verify: looks good.");

      expect(result.result).toBe("PASS");
      expect(result.sessionId).toMatch(/^sesn_mock_/);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockStream).not.toHaveBeenCalled();
    });

    it("returns a FLAGGED result (with the marker echoed into the discrepancy text) when the checked content contains MOCK_FLAG_ME", async () => {
      process.env.CARVE_MOCK_AGENTS = "1";

      const result = await runVerifierSession(
        "Verify: [MOCK GENERATED OUTPUT — MOCK_FLAG_ME] ...",
      );

      expect(result.result).not.toBe("PASS");
      const flagged = result.result as { flagged: string };
      expect(flagged.flagged).toContain("MOCK_FLAG_ME");
    });

    it("throws AgentSessionError when the checked content contains MOCK_ERROR_ME", async () => {
      process.env.CARVE_MOCK_AGENTS = "1";

      await expect(
        runVerifierSession("Verify: MOCK_ERROR_ME"),
      ).rejects.toThrow(AgentSessionError);
    });
  });

  describe("sendFollowUp", () => {
    it("returns canned corrected text without touching the real SDK", async () => {
      process.env.CARVE_MOCK_AGENTS = "1";

      const result = await sendFollowUp(
        "sesn_mock_existing",
        "Your previous attempt was flagged: something. Please regenerate.",
      );

      expect(result.text).toContain("MOCK");
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(mockStream).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("throws AgentSessionError when the follow-up message contains MOCK_ERROR_ME", async () => {
      process.env.CARVE_MOCK_AGENTS = "1";

      await expect(
        sendFollowUp("sesn_mock_existing", "MOCK_ERROR_ME"),
      ).rejects.toThrow(AgentSessionError);
    });
  });

  describe("end-to-end marker propagation through the FLAGGED -> needs_review path", () => {
    it("a MOCK_FLAG_ME kickoff prompt stays flagged through a full generate -> verify -> follow-up -> re-verify cycle", async () => {
      process.env.CARVE_MOCK_AGENTS = "1";

      const generation = await runGeneratorSession(
        "Write a sell sheet. MOCK_FLAG_ME",
      );
      const verification = await runVerifierSession(
        `Verify this content:\n${generation.text}`,
      );
      expect(verification.result).not.toBe("PASS");
      const discrepancy = (verification.result as { flagged: string }).flagged;

      const correction = await sendFollowUp(
        generation.sessionId,
        `Your previous attempt was flagged: ${discrepancy}. Please regenerate, correcting this specific issue.`,
      );
      const reVerification = await runVerifierSession(
        `Verify this content:\n${correction.text}`,
      );

      // The marker survives the whole round trip -> still FLAGGED, exactly
      // like `generateWithVerification` needs to deterministically reach
      // `needs_review` for a test to drive.
      expect(reVerification.result).not.toBe("PASS");
    });
  });

  describe("real path is untouched when the flag is off", () => {
    it("falls through to the real (mocked-SDK) implementation when CARVE_MOCK_AGENTS is unset", async () => {
      // Deliberately NOT setting CARVE_MOCK_AGENTS here.
      mockStream.mockResolvedValue(
        mockEventStream([agentMessage("Real path response."), idleEndTurn()]),
      );

      const result = await runGeneratorSession("prompt");

      expect(result.text).toBe("Real path response.");
      expect(result.sessionId).toBe("sesn_test");
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockStream).toHaveBeenCalledTimes(1);
    });

    it("falls through to the real implementation even when CARVE_MOCK_AGENTS is set to a non-'1' value", async () => {
      process.env.CARVE_MOCK_AGENTS = "true";
      mockStream.mockResolvedValue(
        mockEventStream([agentMessage("Real path response."), idleEndTurn()]),
      );

      const result = await runGeneratorSession("prompt");

      expect(result.text).toBe("Real path response.");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });
});
