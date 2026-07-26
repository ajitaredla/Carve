/**
 * Task 7.3 build fix — `CostWaterfall.verdictStatement`'s "not yet
 * generated" sentinel, extracted out of `actions/waterfall.ts` into its own
 * plain (non-`"use server"`) module.
 *
 * Why this had to move: Next.js's `"use server"` file constraint requires
 * EVERY export from such a file to be an async function — a file cannot
 * export a plain string constant at all, even for its own internal use, once
 * anything outside the module imports from it in a way that pulls it into
 * the Server Actions build graph. This was a latent bug in `actions/
 * waterfall.ts` (task 6.3) that `npx tsc --noEmit` / `npx vitest run` never
 * caught (`"use server"` export-shape checking is a Next.js/SWC-specific
 * build-time transform, not a TypeScript or Vitest concern) — it only
 * surfaced once task 7.3's UI wiring (`actions/generation-ui.ts`) became the
 * first thing to import `actions/waterfall.ts` into an actual page's build
 * graph, and `npx next build` failed with "Only async functions are allowed
 * to be exported in a 'use server' file."
 *
 * Mirrors `lib/assessment/persist.ts`'s `BLOCKER_STATEMENT_PENDING`, which
 * already lived in a plain lib module for the same reason (that file isn't
 * `"use server"` to begin with).
 */
export const VERDICT_STATEMENT_PENDING = "";
