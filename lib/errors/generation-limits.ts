/**
 * Error classes for lib/spend/guard.ts and lib/rate-limit/generation.ts,
 * pulled out into their own dependency-light file (no Prisma import) rather
 * than defined inline in those modules — lib/errors/friendly.ts (this
 * file's only consumer besides the guards themselves) is deliberately kept
 * Prisma-free so it stays safe to import from anywhere in the generation
 * layer without dragging a DB client along; defining these classes inside
 * lib/spend/guard.ts itself (which DOES import prisma) would have broken
 * that for anything importing them from here.
 */

export class SpendCapExceededError extends Error {
  constructor(
    readonly spentUsd: number,
    readonly capUsd: number,
  ) {
    super(
      `Daily AI spend cap of $${capUsd.toFixed(2)} reached ($${spentUsd.toFixed(4)} ` +
        "spent in the last 24h). Generation is blocked until the window " +
        "rolls over, or CARVE_DAILY_SPEND_CAP_USD is raised.",
    );
    this.name = "SpendCapExceededError";
  }
}

export class GenerationRateLimitExceededError extends Error {
  constructor(
    readonly brandId: string,
    readonly count: number,
    readonly limit: number,
  ) {
    super(
      `Generation rate limit reached: ${count}/${limit} requests in the ` +
        "last hour for this brand. Please wait before generating more.",
    );
    this.name = "GenerationRateLimitExceededError";
  }
}
