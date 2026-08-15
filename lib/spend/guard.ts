/**
 * Hard daily spend ceiling for AI generation (2026-08-15) — a real circuit
 * breaker, not just a logged metric. `assertUnderDailySpendCap` is called
 * BEFORE every generation attempt (see actions/assessment.ts, waterfall.ts,
 * documents.ts) and throws `SpendCapExceededError` if the last 24h's
 * recorded spend is already at or over `CARVE_DAILY_SPEND_CAP_USD`, blocking
 * the attempt entirely rather than letting it run and only reporting the
 * overage after the fact (which is what Langfuse's own cost tracking alone
 * would do — see lib/observability/langfuse.ts).
 *
 * Deliberately a GLOBAL cap, not per-founder: with zero real founders on
 * the platform as of this writing, the risk this guards against is a bug
 * or runaway loop burning the whole AI budget, not one founder's fair
 * share of it — see lib/rate-limit/generation.ts for the per-founder
 * request-count limit, a different mechanism for a different risk.
 *
 * The check-then-record pattern below has a known, accepted race: several
 * concurrent calls (e.g. actions/documents.ts's generateAllDocuments runs
 * all 6 document types via Promise.all) can each pass the check before any
 * of them records its spend, allowing a small overshoot past the cap in
 * the worst case. This is a soft business safety net, not a hard financial
 * guarantee — matches the same tolerance actions/documents.ts's own doc
 * comment already accepts for concurrent duplicate generation.
 */
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "./pricing";
import type { ModelUsage } from "@/lib/agents/session";
import { SpendCapExceededError } from "@/lib/errors/generation-limits";

export { SpendCapExceededError };

function dailySpendCapUsd(): number {
  const raw = process.env.CARVE_DAILY_SPEND_CAP_USD;
  // No env var configured -> no cap enforced (opt-in, like CARVE_MOCK_AGENTS
  // and every other env-gated feature in this codebase). A misconfigured
  // (non-numeric) value fails closed to a cap of 0 rather than silently
  // disabling the guard — a typo should never turn into "no cap" by accident.
  if (raw === undefined) return Infinity;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function last24hSpendUsd(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.aiSpendLedger.aggregate({
    where: { createdAt: { gte: since } },
    _sum: { costUsd: true },
  });
  return result._sum.costUsd?.toNumber() ?? 0;
}

/** Call before starting any generation attempt. No-op unless
 * `CARVE_DAILY_SPEND_CAP_USD` is set. */
export async function assertUnderDailySpendCap(): Promise<void> {
  const cap = dailySpendCapUsd();
  if (cap === Infinity) return;
  const spent = await last24hSpendUsd();
  if (spent >= cap) {
    throw new SpendCapExceededError(spent, cap);
  }
}

/**
 * Records actual spend for ONE real model call — a `recordSpendForCalls`
 * call site typically calls this once per distinct model in a generation
 * attempt (e.g. once for the generator's claude-haiku-4-5 usage, once for
 * the verifier's claude-sonnet-4-6 usage), never pre-summed across models
 * into a single call: summing token counts across two differently-priced
 * models before costing them would apply one model's price to the other's
 * tokens. "One row = one real, billed model call" (see the schema comment
 * on AiSpendLedger) is what keeps this both simple and correct.
 */
export async function recordSpend(
  brandId: string,
  surface: string,
  model: string,
  usage: ModelUsage,
): Promise<void> {
  const costUsd = estimateCostUsd(model, usage);
  await prisma.aiSpendLedger.create({
    data: { brandId, surface, costUsd },
  });
}

/** Convenience for the common case: record every real model call a
 * completed generation attempt made in one go. Call after
 * generateWithVerification/generateDocumentWithChecks resolves (success OR
 * needs_review both consumed real tokens); skip on a thrown
 * AgentSessionError, which has no usage figure for the turn that never
 * completed. */
export async function recordSpendForCalls(
  brandId: string,
  surface: string,
  calls: Array<{ model: string; usage: ModelUsage }>,
): Promise<void> {
  await Promise.all(
    calls.map(({ model, usage }) => recordSpend(brandId, surface, model, usage)),
  );
}
