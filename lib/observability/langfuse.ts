/**
 * Thin, env-gated Langfuse tracing for Carve's AI harness (2026-08-15).
 *
 * Manual instrumentation, not a framework integration: every Carve AI call
 * goes through Managed Agents' Sessions API (create -> stream -> drain, see
 * `lib/agents/session.ts`) or a plain `messages.parse()` call
 * (`lib/agents/completeness.ts`) — neither is the single `chat.completions.
 * create()` shape a Langfuse SDK auto-instrumentation wrapper patches, so
 * this wraps each call site directly with `@langfuse/tracing`'s manual
 * observation API. See `instrumentation.ts` (repo root) for the OpenTelemetry
 * NodeSDK + `LangfuseSpanProcessor` bootstrap this relies on to actually
 * ship spans anywhere.
 *
 * Gated on `LANGFUSE_SECRET_KEY`/`LANGFUSE_PUBLIC_KEY` being set, exactly
 * like `CARVE_MOCK_AGENTS` elsewhere in this codebase — when unset (e.g. no
 * Langfuse project configured for this environment), every exported
 * function here is a thin pass-through to `fn()` with zero tracing
 * overhead, so this is zero-risk to have imported everywhere it's used.
 *
 * Every model call below (generator, verifier, completeness checker) is
 * typed `generation`, not `evaluator` — deliberately, even for the verifier/
 * completeness checker, which conceptually ARE Langfuse "evaluators"
 * (functions assessing another LLM's output). `evaluator`'s attribute type
 * has no `model`/`usageDetails` fields — cost and token tracking only apply
 * to `generation`/`embedding` observations (per https://langfuse.com/docs/
 * observability/features/token-and-cost-tracking). Carve wants real cost
 * visibility on the verifier especially (it's the one just escalated to a
 * paid-tier model over a false-negative finding — see agents/carve-verifier
 * .agent.yaml), so `role` in metadata carries the semantic distinction
 * instead: filter/dashboard on `metadata.role` to separate generator calls
 * from verifier/completeness-checker calls.
 */

import {
  startActiveObservation,
  startObservation,
  type LangfuseGeneration,
  type LangfuseSpan,
} from "@langfuse/tracing";
import type { ModelUsage } from "@/lib/agents/session";

export type ObservationRole = "generator" | "verifier" | "completeness_checker";

export function isLangfuseEnabled(): boolean {
  return Boolean(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);
}

function toUsageDetails(usage: ModelUsage): Record<string, number> {
  return {
    input: usage.inputTokens,
    output: usage.outputTokens,
    cache_read_input_tokens: usage.cacheReadInputTokens,
    cache_creation_input_tokens: usage.cacheCreationInputTokens,
  };
}

/**
 * One trace = one self-contained generation attempt (per Langfuse's own
 * trace-scoping guidance — https://langfuse.com/docs/observability/best-
 * practices) — wraps `generateWithVerification`/`generateDocumentWithChecks`
 * so every nested generation call inside `fn` nests under it automatically
 * via OpenTelemetry's async context, with no manual span threading through
 * either function's multi-branch control flow.
 */
export async function traceSurface<T>(
  name: string,
  metadata: Record<string, unknown>,
  fn: (span: LangfuseSpan) => Promise<T>,
): Promise<T> {
  if (!isLangfuseEnabled()) return fn(NOOP_SPAN);
  return startActiveObservation(name, async (span) => {
    span.update({ metadata });
    return fn(span);
  });
}

/** Returned to `fn` when tracing is disabled — every method is a no-op
 * so call sites can unconditionally call `span.update(...)` without an
 * `isLangfuseEnabled()` check of their own. */
const NOOP_SPAN = {
  update: () => NOOP_SPAN,
  end: () => NOOP_SPAN,
} as unknown as LangfuseSpan;

export interface TypedObservation {
  ok(output: string, usage: ModelUsage): void;
  error(err: unknown): void;
}

const NOOP_OBSERVATION: TypedObservation = { ok: () => {}, error: () => {} };

function wrapGeneration(generation: LangfuseGeneration): TypedObservation {
  return {
    ok(output, usage) {
      generation.update({ output, usageDetails: toUsageDetails(usage) }).end();
    },
    error(err) {
      generation
        .update({
          level: "ERROR",
          statusMessage: err instanceof Error ? err.message : String(err),
        })
        .end();
    },
  };
}

/**
 * Wraps one model call — `runGeneratorSession`/`sendFollowUp` (`role:
 * "generator"`), `runVerifierSession` (`role: "verifier"`), or
 * `runCompletenessCheck` (`role: "completeness_checker"`). Always
 * `generation`-typed so cost/token tracking works for all three — see the
 * file header for why `evaluator` isn't used despite the verifier/
 * completeness checker conceptually being evaluators.
 */
export function startModelObservation(
  name: string,
  params: { model: string; input: string; role: ObservationRole },
): TypedObservation {
  if (!isLangfuseEnabled()) return NOOP_OBSERVATION;
  const generation = startObservation(
    name,
    { model: params.model, input: params.input, metadata: { role: params.role } },
    { asType: "generation" },
  );
  return wrapGeneration(generation);
}
