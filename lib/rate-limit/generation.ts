/**
 * Per-founder rate limit on AI generation requests (2026-08-15) — a
 * different mechanism from lib/spend/guard.ts's GLOBAL daily $ cap: this
 * protects fairness/abuse per brand (one founder hammering "regenerate"
 * shouldn't degrade the shared MCP/Managed-Agents capacity for everyone
 * else), not total spend. Complementary, not redundant — see that file's
 * header for the cap's own reasoning.
 *
 * Backed by the existing `GenerationLog` table (joined through `Assessment`
 * to get `brandId` — `GenerationLog` itself has no brand column) rather
 * than a new table or in-memory counter: it's already the durable,
 * per-request audit trail every generation writes to, so this needs no new
 * schema and is correct across multiple server instances for free (unlike
 * an in-memory counter — contrast lib/mcp/rate-limit.ts, which can't use
 * this approach since MCP calls have no founder identity to key on).
 */
import { prisma } from "@/lib/prisma";
import { GenerationRateLimitExceededError } from "@/lib/errors/generation-limits";

export { GenerationRateLimitExceededError };

function hourlyLimit(): number {
  const raw = process.env.CARVE_FOUNDER_HOURLY_GENERATION_LIMIT;
  // Unset -> unlimited (opt-in, matching every other env-gated guard in this
  // codebase). A non-numeric value fails closed to 0 rather than silently
  // disabling the limit.
  if (raw === undefined) return Infinity;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Call at the top of any Server Action that's about to start a generation
 * attempt for `brandId` — see actions/assessment.ts, waterfall.ts,
 * documents.ts. No-op unless `CARVE_FOUNDER_HOURLY_GENERATION_LIMIT` is set.
 */
export async function assertUnderGenerationRateLimit(brandId: string): Promise<void> {
  const limit = hourlyLimit();
  if (limit === Infinity) return;

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.generationLog.count({
    where: {
      createdAt: { gte: since },
      assessment: { brandId },
    },
  });

  if (count >= limit) {
    throw new GenerationRateLimitExceededError(brandId, count, limit);
  }
}
