/**
 * Task 7.2/7.3 — error-message triage for `actions/assessment.ts` /
 * `actions/waterfall.ts`, whose known-error paths THROW rather than
 * returning an `error` state (per 6.9's architect review, task list note on
 * 7.2/7.3: "this view needs its own try/catch + friendly-message triage" —
 * NOT covered by 7.4a, which is scoped to `actions/documents.ts` only).
 *
 * Same posture as 6.8's product ruling on `documents.ts`'s raw-message leak:
 * "the current blanket `error.message` passthrough isn't [showing founders
 * the real reason], it needs triage, not a binary sanitize/don't-sanitize
 * call." Known, structured, already-safe-to-show error types get a specific,
 * actionable message; genuinely unexpected internals (Prisma errors, missing
 * env config, a plain `Error` thrown from deep inside a dependency) are
 * sanitized to a generic message and logged server-side instead, mirroring
 * `lib/mcp/tools.ts`'s `safeToolCall` precedent.
 *
 * Deliberately a small, dependency-light module (no Prisma import) so it's
 * safe to reuse from any Server Action that calls into the generation layer
 * — `actions/documents.ts`'s own 7.4a fix (tracked separately, not built by
 * this task) can adopt this same helper instead of re-deriving its own
 * classification logic.
 */

import { AgentSessionError } from "@/lib/agents/session";
import { CompletenessCheckError } from "@/lib/agents/completeness";
import { ScoringInputMappingError } from "@/lib/scoring/map-retailer-requirements";
import { WaterfallInputError } from "@/lib/waterfall/calculator";

export interface FriendlyError {
  /** Safe to render directly to the founder. */
  message: string;
}

const GENERIC_FALLBACK_MESSAGE =
  "Something went wrong while processing this request. Please try again, " +
  "and contact support if it keeps happening.";

const AGENT_SESSION_MESSAGE =
  "Carve's AI assistant couldn't finish this request just now (a temporary " +
  "issue on our end, not a problem with your data). Please try again in a " +
  "moment.";

/**
 * Classifies an unknown thrown value into a founder-safe message.
 *
 * `context` is a short label (e.g. the calling function's name) used only in
 * the server-side log line for the "unexpected internals" branch — it is
 * never included in the message returned to the caller.
 */
export function toFriendlyGenerationError(
  error: unknown,
  context: string,
): FriendlyError {
  if (error instanceof AgentSessionError) {
    return { message: AGENT_SESSION_MESSAGE };
  }

  // Same founder-facing message as an AgentSessionError — both are "our AI
  // layer hit an unexpected problem," and a founder has no actionable reason
  // to distinguish "the generator's session failed" from "the completeness
  // checker's API call failed."
  if (error instanceof CompletenessCheckError) {
    return { message: AGENT_SESSION_MESSAGE };
  }

  // ScoringInputMappingError / WaterfallInputError are already structured,
  // founder-actionable validation messages (see each class's own file header)
  // — safe to surface directly, same way documents.ts's precedent surfaces
  // known operational failures rather than blanket-sanitizing everything.
  if (error instanceof ScoringInputMappingError) {
    return { message: `We couldn't score this assessment: ${error.message}` };
  }
  if (error instanceof WaterfallInputError) {
    return {
      message: `We couldn't calculate the waterfall: ${error.message}`,
    };
  }

  // Unexpected internals — Prisma errors, missing env config (confirmed in
  // 6.8's product review to leak ops-internal text like "Copy .env.example
  // to .env and fill in..."), or any other unrecognized throw. Sanitize the
  // founder-facing message; log the real one server-side for debugging.
  console.error(`[${context}] unexpected error`, error);
  return { message: GENERIC_FALLBACK_MESSAGE };
}
