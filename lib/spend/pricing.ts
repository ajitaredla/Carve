/**
 * Per-model USD pricing, hardcoded — same numbers Langfuse itself resolved
 * live against its own pricing table when auditing the 2026-08-15 tracing
 * integration (see that work's PR): claude-haiku-4-5 at $1/$5 per M input/
 * output tokens (agents/carve-generator.agent.yaml's stated cost tier),
 * claude-sonnet-4-6 at $3/$15 per M (agents/carve-verifier.agent.yaml,
 * escalated from haiku the same day).
 *
 * Duplicated here rather than read from Langfuse at request time on
 * purpose: the spend cap in lib/spend/guard.ts is a hot-path safety check
 * that must not depend on an external service being reachable or fast.
 * Update this table if either agent's model changes.
 */
import type { ModelUsage } from "@/lib/agents/session";

interface ModelPricing {
  /** USD per input token (non-cached). */
  input: number;
  /** USD per output token. */
  output: number;
  /** USD per cache-read input token — typically a fraction of `input`. */
  cacheRead: number;
  /** USD per cache-creation input token. */
  cacheCreation: number;
}

const PRICING_PER_TOKEN: Record<string, ModelPricing> = {
  "claude-haiku-4-5": {
    input: 1 / 1_000_000,
    output: 5 / 1_000_000,
    cacheRead: 0.1 / 1_000_000,
    cacheCreation: 1.25 / 1_000_000,
  },
  "claude-sonnet-4-6": {
    input: 3 / 1_000_000,
    output: 15 / 1_000_000,
    cacheRead: 0.3 / 1_000_000,
    cacheCreation: 3.75 / 1_000_000,
  },
};

/**
 * Returns 0 for an unrecognized model rather than throwing — an unknown
 * model should never be the thing that blocks a spend-cap check from
 * running at all (fail open on the ESTIMATE, fail closed on the CAP
 * itself — see lib/spend/guard.ts).
 */
export function estimateCostUsd(model: string, usage: ModelUsage): number {
  const pricing = PRICING_PER_TOKEN[model];
  if (!pricing) return 0;
  return (
    usage.inputTokens * pricing.input +
    usage.outputTokens * pricing.output +
    usage.cacheReadInputTokens * pricing.cacheRead +
    usage.cacheCreationInputTokens * pricing.cacheCreation
  );
}
