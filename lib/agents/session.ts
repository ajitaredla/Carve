/**
 * Task 6.1 — Managed Agents session-flow helper.
 *
 * Drives one turn of a Claude Managed Agents session end-to-end: create (or
 * reuse) a session, open its event stream, send a message, drain the stream
 * to a terminal state, and extract the agent's final text + token usage.
 * Used by the not-yet-built Server Action flow (task 6.2+) to run
 * `carve-generator` and `carve-verifier` sessions — see `agents/*.agent.yaml`
 * for those agents' configs and `.env`/`.env.example` for the live
 * `CARVE_*_AGENT_ID` / `CARVE_ENVIRONMENT_ID` / `CARVE_VAULT_ID` values this
 * file reads.
 *
 * This environment cannot run a real end-to-end session: the MCP server
 * (`/api/mcp`) is local-only, and both agent YAMLs still point at a
 * placeholder `mcp_server_url` (task 6.0b, deployment, is explicitly the
 * user's job on Azure — see tasks-carve-v1.md). Everything below is built and
 * unit-tested against the real `@anthropic-ai/sdk` types with mocked
 * `client.beta.sessions.*` calls (`session.test.ts`), not a live call.
 *
 * Task 7.0a adds a SEPARATE, `CARVE_MOCK_AGENTS=1`-gated mock seam (see the
 * "Mock seam" section below, above the drain loop) so UI/e2e work (7.2-7.4,
 * 7.6a, 9.0) can exercise all three real-world outcomes — final/PASS,
 * FLAGGED (-> `needs_review` via `lib/agents/generate.ts`'s retry state
 * machine), and a thrown `AgentSessionError` — without a live deployment.
 * This is unrelated to `session.test.ts`'s SDK-mocking strategy above: that
 * tests THIS file's real implementation; the mock seam REPLACES it, gated on
 * an env var, for callers that don't want to hit the real API at all.
 *

 * ---------------------------------------------------------------------------
 * 5.8 architect review notes, applied here:
 * ---------------------------------------------------------------------------
 * (a) `vault_ids` is only accepted on `sessions.create()` — the SDK's own
 *     `SessionUpdateParams.vault_ids` docstring says as much ("Not yet
 *     supported; requests setting this field are rejected"). Every session
 *     this file creates passes `vault_ids: [CARVE_VAULT_ID]` at creation.
 * (b) The drain loop does NOT break on `session.status_idle` alone — a
 *     session goes transiently idle between parallel tool calls too. It
 *     breaks on `session.status_terminated`, or on `session.status_idle`
 *     whose `stop_reason.type !== 'requires_action'` (see `driveTurn` below).
 * (c) A `session.error` stream event is logged, not treated as this call's
 *     outcome — a failed tool call can legitimately surface as the agent's
 *     own text (e.g. the verifier saying "could not verify"), so a
 *     `session.error` event during an otherwise-successful run must not
 *     cause a false failure here.
 * (d) The event stream is opened BEFORE the kickoff `user.message` is sent
 *     (stream-first ordering) — otherwise the agent can process the message
 *     and emit early events before this file's consumer is attached.
 *
 * Session-level failures — `session.status_terminated`, a `session.status_idle`
 * whose `stop_reason.type === 'retries_exhausted'`, or the stream itself
 * throwing (network drop, transport error) — reject the returned promise.
 * They are never folded into `runVerifierSession`'s `result` union; only a
 * normal `PASS` / `FLAGGED: <discrepancy>` agent response produces that.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { BetaManagedAgentsSession } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";
import type {
  BetaManagedAgentsStreamSessionEvents,
  BetaManagedAgentsTextBlock,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Lazy singleton so importing this module never eagerly constructs a client
 * (relevant for tests, which mock the `@anthropic-ai/sdk` module entirely —
 * see `session.test.ts`). Picks up credentials from the environment
 * (`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / an `ant auth login`
 * profile) exactly like every other Claude API call in this codebase.
 */
let cachedClient: Anthropic | undefined;

function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill in the live ` +
        "Managed Agents resource id (task 5.0 created these live — see " +
        "the CARVE_* section of .env.example).",
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Token usage for one drained turn, summed across every model request the
 * agent made within it (a turn can involve several — e.g. one per tool call
 * round-trip). Field names match `BetaManagedAgentsSpanModelUsage`'s
 * snake_case wire fields, just camelCased for this codebase's convention. */
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

function emptyUsage(): ModelUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

/**
 * Thrown for every session-level failure this helper can detect: the session
 * terminated, its retry budget was exhausted, it went idle awaiting a client
 * action this helper doesn't handle (Carve's agents only use always-allow
 * MCP tools — see `agents/*.agent.yaml` — so this shouldn't occur in
 * practice), or its event stream ended without ever reaching a terminal
 * state. Distinct from a normal verifier `FLAGGED` result, which is a
 * successful call outcome, not a thrown error.
 */
export class AgentSessionError extends Error {
  constructor(
    message: string,
    readonly sessionId: string,
  ) {
    super(message);
    this.name = "AgentSessionError";
  }
}

export interface GeneratorSessionResult {
  text: string;
  sessionId: string;
  usage: ModelUsage;
}

/** The verifier's contract (see `agents/carve-verifier.agent.yaml`'s system
 * prompt): respond with exactly "PASS" or "FLAGGED: <discrepancy>". Any other
 * shape is a session-level anomaly (thrown), never a third result value. */
export type VerifierResult = "PASS" | { flagged: string };

export interface VerifierSessionResult {
  result: VerifierResult;
  sessionId: string;
  usage: ModelUsage;
}

// ---------------------------------------------------------------------------
// Mock seam (task 7.0a — per 6.9's architect review: no way to exercise
// AI-dependent flows without a live Managed Agents connection existed before
// this).
// ---------------------------------------------------------------------------
//
// Set `CARVE_MOCK_AGENTS=1` and every exported function below
// (`runGeneratorSession`, `runVerifierSession`, `sendFollowUp`) returns a
// deterministic canned result instead of touching `getClient()` / the real
// `@anthropic-ai/sdk` at all. When the flag is unset (including its total
// absence, e.g. in production), every line below is dead code that never
// runs — `isMockMode()` is the ONLY new branch point in the three exported
// functions, so the real path is byte-for-byte unchanged and this is
// zero-risk to production.
//
// --- Trigger mechanism (read this before writing a task 9.0 Playwright test,
// or any manual test, against this seam) --------------------------------
//
// The mock inspects the TEXT it's given (the kickoff prompt for
// `runGeneratorSession`, the verify prompt for `runVerifierSession`, the
// follow-up message for `sendFollowUp`) for two literal marker substrings.
// A future caller controls the outcome simply by getting one of these
// strings into the prompt Carve's own code builds — e.g. by setting
// `Brand.name` (or any other founder-supplied field a kickoff-prompt builder
// interpolates) to a value containing the marker:
//
//   - `"MOCK_ERROR_ME"` anywhere in the text -> throws `AgentSessionError`,
//     simulating a session-level failure (network drop / retries exhausted /
//     malformed response — the class of failure real callers must already
//     handle without assuming a `GenerationLog` row exists, per 6.7's QC
//     note).
//   - `"MOCK_FLAG_ME"` anywhere in the text -> the mock generator embeds the
//     SAME marker literally in its canned output text, so it flows straight
//     into `generateWithVerification`'s `verifyPrompt(generation.text)` call
//     (see `lib/agents/generate.ts`) and the mock verifier sees it too,
//     returning a `FLAGGED` result whose discrepancy string ALSO contains
//     the marker. Because `generate.ts`'s regeneration step forwards the
//     verifier's exact discrepancy text into `sendFollowUp`'s follow-up
//     message (6.1a's design), the marker keeps propagating through the
//     one-and-only regeneration attempt too — so a single `MOCK_FLAG_ME` in
//     the ORIGINAL kickoff prompt deterministically drives the entire FLAGGED
//     -> regenerate -> FLAGGED again -> `needs_review` path end-to-end, not
//     just a single FLAGGED response. This is deliberate: it means one
//     marker exercises both "the retry path got exercised at all" (a
//     `sendFollowUp` call happened) AND the durable `needs_review` end state
//     7.0b's status helper and 7.6a/9.3 need to test, without a second
//     marker to keep track of.
//   - Anything else (no marker present) -> a canned `PASS` (verifier) /
//     canned success text (generator/follow-up), i.e. the normal `final`
//     result path.
//
// All three functions apply this uniformly to whatever text they're given —
// there is no generator-vs-verifier-specific trigger. If a future test needs
// to simulate, say, a verifier-only failure against an otherwise-clean
// generation, it can call `runVerifierSession` directly with a marker-bearing
// prompt (bypassing `generateWithVerification`) rather than relying on the
// state machine to route a marker there selectively.
//
// Session ids are real (random) `crypto.randomUUID()`-based strings prefixed
// `sesn_mock_...` so they're visually unmistakable in logs/`GenerationLog`
// rows, and usage figures are small fixed non-zero numbers (never zero) so
// code that sums/displays token usage has something realistic to render.

const CARVE_MOCK_AGENTS_FLAG = "CARVE_MOCK_AGENTS";
const MOCK_FLAG_MARKER = "MOCK_FLAG_ME";
const MOCK_ERROR_MARKER = "MOCK_ERROR_ME";

function isMockMode(): boolean {
  return process.env[CARVE_MOCK_AGENTS_FLAG] === "1";
}

function mockSessionId(): string {
  return `sesn_mock_${crypto.randomUUID()}`;
}

function mockUsage(inputTokens: number, outputTokens: number): ModelUsage {
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

function mockGeneratorText(prompt: string, label: string): string {
  if (prompt.includes(MOCK_FLAG_MARKER)) {
    return (
      `[MOCK ${label} OUTPUT — ${MOCK_FLAG_MARKER}] This canned draft ` +
      `deliberately carries the ${MOCK_FLAG_MARKER} marker forward so the ` +
      "mock verifier (which inspects the exact text it's asked to check) " +
      "also flags it. Produced by the CARVE_MOCK_AGENTS=1 seam — no real " +
      "Managed Agents call was made."
    );
  }
  return (
    `[MOCK ${label} OUTPUT] Deterministic canned generation produced by ` +
    "the CARVE_MOCK_AGENTS=1 seam — no real Managed Agents call was made."
  );
}

async function mockRunGeneratorSession(
  prompt: string,
): Promise<GeneratorSessionResult> {
  const sessionId = mockSessionId();
  if (prompt.includes(MOCK_ERROR_MARKER)) {
    throw new AgentSessionError(
      `[CARVE_MOCK_AGENTS] Simulated session-level failure — the kickoff ` +
        `prompt contained the ${MOCK_ERROR_MARKER} marker.`,
      sessionId,
    );
  }
  return {
    text: mockGeneratorText(prompt, "GENERATED"),
    sessionId,
    usage: mockUsage(120, 60),
  };
}

async function mockSendFollowUp(
  sessionId: string,
  message: string,
): Promise<{ text: string; usage: ModelUsage }> {
  if (message.includes(MOCK_ERROR_MARKER)) {
    throw new AgentSessionError(
      `[CARVE_MOCK_AGENTS] Simulated session-level failure on follow-up — ` +
        `the message contained the ${MOCK_ERROR_MARKER} marker.`,
      sessionId,
    );
  }
  return {
    text: mockGeneratorText(message, "CORRECTED"),
    usage: mockUsage(150, 80),
  };
}

async function mockRunVerifierSession(
  prompt: string,
): Promise<VerifierSessionResult> {
  const sessionId = mockSessionId();
  if (prompt.includes(MOCK_ERROR_MARKER)) {
    throw new AgentSessionError(
      `[CARVE_MOCK_AGENTS] Simulated session-level failure — the verify ` +
        `prompt contained the ${MOCK_ERROR_MARKER} marker.`,
      sessionId,
    );
  }
  if (prompt.includes(MOCK_FLAG_MARKER)) {
    return {
      result: {
        flagged:
          `[mock] Found the ${MOCK_FLAG_MARKER} marker in the checked ` +
          "content — simulated verifier discrepancy for testing " +
          "(CARVE_MOCK_AGENTS=1).",
      },
      sessionId,
      usage: mockUsage(90, 20),
    };
  }
  return { result: "PASS", sessionId, usage: mockUsage(90, 5) };
}

// ---------------------------------------------------------------------------
// Drain loop — shared by the generator, the verifier, and follow-up sends.
// ---------------------------------------------------------------------------

/**
 * Opens `sessionId`'s event stream, invokes `sendEvent` (stream-first
 * ordering, per note (d) above), then drains the stream to a terminal state.
 * Returns the LAST `agent.message` event's concatenated text (the model's
 * concluding statement — both agents' system prompts specify a single final
 * textual output, so an earlier `agent.message` before a tool call, if any,
 * is not the answer) plus summed usage across every `span.model_request_end`
 * seen. Throws `AgentSessionError` on any session-level failure (note (b)/(c)
 * above), and lets a `session.error` *event* pass through as informational
 * logging only — it is not this function's outcome.
 */
async function driveTurn(
  client: Anthropic,
  sessionId: string,
  sendEvent: () => Promise<unknown>,
): Promise<{ text: string; usage: ModelUsage }> {
  // (d) Stream-first: open before sending, so no early event is missed.
  const stream = await client.beta.sessions.events.stream(sessionId);
  await sendEvent();

  let lastMessageText: string | undefined;
  const usage = emptyUsage();

  for await (const event of stream as AsyncIterable<BetaManagedAgentsStreamSessionEvents>) {
    switch (event.type) {
      case "agent.message": {
        lastMessageText = event.content
          .filter(
            (block): block is BetaManagedAgentsTextBlock =>
              block.type === "text",
          )
          .map((block) => block.text)
          .join("");
        break;
      }

      case "span.model_request_end": {
        const modelUsage = event.model_usage;
        usage.inputTokens += modelUsage.input_tokens;
        usage.outputTokens += modelUsage.output_tokens;
        usage.cacheCreationInputTokens += modelUsage.cache_creation_input_tokens;
        usage.cacheReadInputTokens += modelUsage.cache_read_input_tokens;
        break;
      }

      case "session.error": {
        // (c) Informational only. A failed tool call inside the session can
        // legitimately surface as the agent's own text (e.g. the verifier
        // saying "could not verify") — this is not this call's outcome.
        console.error(
          `[lib/agents/session] session ${sessionId} reported session.error`,
          event.error,
        );
        break;
      }

      case "session.status_terminated": {
        throw new AgentSessionError(
          `Session ${sessionId} terminated before this turn completed.`,
          sessionId,
        );
      }

      case "session.status_idle": {
        const { stop_reason } = event;

        if (stop_reason.type === "requires_action") {
          // Carve's agents only declare read-only, always-allow MCP tools
          // (agents/*.agent.yaml) — they should never need a client-side
          // tool confirmation or custom tool result. Treat this as an
          // anomaly rather than hanging forever with nothing to resolve it.
          throw new AgentSessionError(
            `Session ${sessionId} went idle awaiting a client action ` +
              "(tool confirmation / custom tool result) this helper does " +
              "not provide — Carve's agents should only use always-allow " +
              "MCP tools.",
            sessionId,
          );
        }

        if (stop_reason.type === "retries_exhausted") {
          throw new AgentSessionError(
            `Session ${sessionId} exhausted its retry budget before this turn completed.`,
            sessionId,
          );
        }

        // stop_reason.type === "end_turn" — normal completion.
        if (lastMessageText === undefined) {
          throw new AgentSessionError(
            `Session ${sessionId} ended its turn without ever producing an agent.message.`,
            sessionId,
          );
        }
        return { text: lastMessageText, usage };
      }

      default:
        break;
    }
  }

  // The stream ended (no more events) without a terminal status event —
  // e.g. a dropped connection. Session-level failure, per this task's
  // "stream error" case.
  throw new AgentSessionError(
    `Session ${sessionId}'s event stream ended without a terminal status event.`,
    sessionId,
  );
}

async function createSession(
  client: Anthropic,
  agentId: string,
): Promise<BetaManagedAgentsSession> {
  return client.beta.sessions.create({
    agent: agentId,
    environment_id: requireEnv("CARVE_ENVIRONMENT_ID"),
    // (a) vault_ids must be set here — sessions.update() rejects it.
    vault_ids: [requireEnv("CARVE_VAULT_ID")],
  });
}

function userMessageEvent(text: string) {
  return {
    events: [
      {
        type: "user.message" as const,
        content: [{ type: "text" as const, text }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// runGeneratorSession
// ---------------------------------------------------------------------------

/**
 * One-shot kickoff of a fresh `carve-generator` session: create, send
 * `prompt` as the opening `user.message`, drain to completion. Returns the
 * agent's final text, the session id (needed by `sendFollowUp` for the 6.1a
 * regeneration flow below, and by 6.5's `GenerationLog` persistence), and
 * token usage.
 */
export async function runGeneratorSession(
  prompt: string,
): Promise<GeneratorSessionResult> {
  if (isMockMode()) {
    return mockRunGeneratorSession(prompt);
  }

  const client = getClient();
  const session = await createSession(
    client,
    requireEnv("CARVE_GENERATOR_AGENT_ID"),
  );

  const { text, usage } = await driveTurn(client, session.id, () =>
    client.beta.sessions.events.send(session.id, userMessageEvent(prompt)),
  );

  return { text, sessionId: session.id, usage };
}

// ---------------------------------------------------------------------------
// sendFollowUp — the 6.1a continuation mechanism.
// ---------------------------------------------------------------------------

/**
 * ---------------------------------------------------------------------------
 * 6.1a decision: regeneration continues the SAME generator session.
 * ---------------------------------------------------------------------------
 *
 * The task file's own note (written before this file existed) said
 * regeneration should start "a new session." 5.8's architect review corrected
 * that to "pass the verifier's exact discrepancy forward" without pinning
 * down the exact mechanism — building that mechanism is this task's job, and
 * the call below reverses the original "new session" note. Documented here,
 * not just in a commit message, because it's a real reversal someone reading
 * only the task file would not expect:
 *
 * 1. **The model has the actual discrepancy to correct against.** A fresh
 *    kickoff session with identical inputs and no feedback has a real chance
 *    of reproducing the same flagged content — `carve-generator`'s tools
 *    (`get_retailer_requirements`, `get_brand_context`,
 *    `run_waterfall_calculator`) are deterministic, so a from-scratch retry
 *    isn't a random re-roll, it's the same generation running again. Sending
 *    the verifier's exact `FLAGGED: <discrepancy>` text into the SAME
 *    session, as a follow-up `user.message`, gives the model its own prior
 *    output plus the specific thing that was wrong with it — a materially
 *    different (and much more likely to actually fix the problem) prompt
 *    than "try again from nothing."
 * 2. **It's cheaper.** Each session is a full container lifecycle (5.7's
 *    product review flagged that §10.2's cost table doesn't model this at
 *    all). A new-session regeneration is generate + verify + regenerate +
 *    re-verify = 4 session lifecycles. Continuing the same generator session
 *    for the correction is generate+correct (1 session, 2 turns) + verify +
 *    re-verify = 3 session lifecycles. Multiplied across 6.4's six document
 *    types, that's a real, currently-invisible cost/latency difference, not
 *    a rounding error.
 *
 * This is the lower-level primitive the design intentionally exposes rather
 * than baking continuation into `runGeneratorSession` itself: the retry/
 * review state machine (6.1a's other half — regenerate once, re-verify,
 * PASS-or-needs-review) is a separate task (6.2+, not built here). That
 * caller needs exactly this shape — the original `sessionId` plus the
 * verifier's exact flagged text — to drive the continuation.
 */
export async function sendFollowUp(
  sessionId: string,
  message: string,
): Promise<{ text: string; usage: ModelUsage }> {
  if (isMockMode()) {
    return mockSendFollowUp(sessionId, message);
  }

  const client = getClient();
  return driveTurn(client, sessionId, () =>
    client.beta.sessions.events.send(sessionId, userMessageEvent(message)),
  );
}

// ---------------------------------------------------------------------------
// runVerifierSession
// ---------------------------------------------------------------------------

const FLAGGED_PREFIX = "FLAGGED:";

/**
 * Parses the verifier's final `agent.message` text against its system
 * prompt's exact contract ("respond with EXACTLY one of: PASS / FLAGGED:
 * <the specific discrepancy>" — see `agents/carve-verifier.agent.yaml`).
 * Anything else is a session-level anomaly (thrown), never folded in as a
 * silent third result type.
 */
function parseVerifierResult(text: string, sessionId: string): VerifierResult {
  const trimmed = text.trim();

  if (trimmed === "PASS") {
    return "PASS";
  }

  if (trimmed.startsWith(FLAGGED_PREFIX)) {
    const discrepancy = trimmed.slice(FLAGGED_PREFIX.length).trim();
    if (discrepancy.length === 0) {
      throw new AgentSessionError(
        `Verifier session ${sessionId} returned "FLAGGED:" with no ` +
          "discrepancy text, which doesn't match its contract of exactly " +
          '"PASS" or "FLAGGED: <the specific discrepancy>".',
        sessionId,
      );
    }
    return { flagged: discrepancy };
  }

  throw new AgentSessionError(
    `Verifier session ${sessionId} returned an unexpected output shape ` +
      `(expected exactly "PASS" or "FLAGGED: <discrepancy>"): ` +
      `${JSON.stringify(text)}`,
    sessionId,
  );
}

/**
 * One-shot kickoff of a fresh `carve-verifier` session. Unlike the generator,
 * the verifier is always given a fresh session per verification pass — each
 * regeneration needs an *independent* re-check, so there is no equivalent of
 * `sendFollowUp` for the verifier (see the 6.1a decision above: continuation
 * applies to the generator's correction step, not to verification itself).
 */
export async function runVerifierSession(
  prompt: string,
): Promise<VerifierSessionResult> {
  if (isMockMode()) {
    return mockRunVerifierSession(prompt);
  }

  const client = getClient();
  const session = await createSession(
    client,
    requireEnv("CARVE_VERIFIER_AGENT_ID"),
  );

  const { text, usage } = await driveTurn(client, session.id, () =>
    client.beta.sessions.events.send(session.id, userMessageEvent(prompt)),
  );

  return {
    result: parseVerifierResult(text, session.id),
    sessionId: session.id,
    usage,
  };
}

// ---------------------------------------------------------------------------
// 6.1c note — concurrency safety for 6.4's implementer.
// ---------------------------------------------------------------------------
//
// `runGeneratorSession` and `runVerifierSession` are safe to call
// concurrently (e.g. `Promise.all` across 6.4's six document types). Each
// call creates its own new session with its own session id; there is no
// shared mutable state across calls except the lazily-cached `Anthropic`
// client itself, which is stateless per-request and safe for concurrent use
// (the SDK is designed for exactly this). `sendFollowUp`, by contrast,
// mutates an *existing* session — do NOT call `sendFollowUp` concurrently
// against the SAME `sessionId` from two call sites; the session's event
// stream and turn-taking model do not support that, and interleaved sends
// would race. Concurrent `sendFollowUp` calls against DIFFERENT session ids
// are fine, same as the one-shot helpers.
