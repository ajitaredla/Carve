/**
 * Rate limit for `/api/mcp` (2026-08-15). In-memory sliding window, not
 * DB/Redis-backed — deliberately, for now: every caller authenticates with
 * the SAME shared bearer token (see app/api/mcp/route.ts's trust-boundary
 * header comment), so there is no per-caller identity to key a durable
 * limit on anyway; this is a global "don't let the MCP server get hammered"
 * ceiling, not a per-tenant fairness mechanism (contrast
 * lib/rate-limit/generation.ts, which IS per-founder and DB-backed because
 * founder identity exists at that layer).
 *
 * Known limitation, stated plainly: an in-memory window resets on restart
 * and does not coordinate across multiple container replicas. Correct for
 * Carve's current single-replica deployment (docs/production-setup.md).
 * If Carve scales to multiple replicas, this needs to move to Redis (or
 * equivalent) to stay correct — tracked here rather than silently
 * discovered later.
 */

const WINDOW_MS = 60_000;

interface Window {
  windowStart: number;
  count: number;
}

let currentWindow: Window | null = null;

function limitPerMinute(): number {
  const raw = process.env.CARVE_MCP_RATE_LIMIT_PER_MIN;
  // Unset -> unlimited, matching every other env-gated guard in this
  // codebase. A non-numeric value fails closed to 0.
  if (raw === undefined) return Infinity;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Returns true if the request is allowed, false if the caller should get a
 * 429. Pure/testable: takes `now` as a param rather than reading Date.now()
 * internally so a test can drive the window deterministically. */
export function checkMcpRateLimit(now: number = Date.now()): boolean {
  const limit = limitPerMinute();
  if (limit === Infinity) return true;

  if (!currentWindow || now - currentWindow.windowStart >= WINDOW_MS) {
    currentWindow = { windowStart: now, count: 0 };
  }

  currentWindow.count += 1;
  return currentWindow.count <= limit;
}

/** Test-only: reset the module-level window between test cases. */
export function resetMcpRateLimitForTesting(): void {
  currentWindow = null;
}
