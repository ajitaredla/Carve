/**
 * Task 7.5 — Not-ready redirect state (FR-06).
 *
 * "If readiness score falls below 40/100 for target retailer, Carve
 * explicitly states the brand is not ready and recommends an alternative
 * stepping-stone retailer." (PRD §6.1 FR-06)
 *
 * Single source of truth for the 40/100 threshold, shared by the assessment
 * detail view (7.2/7.5's banner) and the brand-home assessment list (7.2's
 * per-assessment status badge) so the two views can never disagree about
 * which assessments count as "not ready."
 *
 * No stepping-stone-recommendation ENGINE exists anywhere in this codebase
 * (no retailer-tiering/sizing data model, no matching logic) — per the task
 * brief, this deliberately stays a static, honest message that references
 * the assessment's own blocker dimension rather than inventing a specific
 * alternate-retailer recommendation the codebase has no data to back up.
 */

export const NOT_READY_SCORE_THRESHOLD = 40;

export function isNotReadyForRetailer(overallScore: number): boolean {
  return overallScore < NOT_READY_SCORE_THRESHOLD;
}
