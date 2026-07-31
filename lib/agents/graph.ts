/**
 * Small, shared helpers for `lib/agents/document-graph.ts`'s explicit
 * generate -> [fact_check, completeness_check] -> decide -> regenerate ->
 * [fact_check, completeness_check] -> decide graph.
 *
 * Deliberately NOT a generic node-registry/edge-table graph interpreter —
 * this codebase has exactly two graph shapes (the existing 2-node chain in
 * `lib/agents/generate.ts`, and this new 4-node fan-out/fan-in), and an
 * abstraction generic enough to describe both would be more code than either
 * shape needs. This file is just: a structured-logging wrapper or checking
 * every node call goes through, and two pure functions for combining
 * multiple checkers' results.
 */

import type { CheckResult } from "./completeness";

/**
 * Wraps a single graph node's execution with structured, greppable logging
 * (surface, node name, outcome, duration) — the observability piece of
 * "production grade": if a document gets stuck in needs_review, the logs
 * show exactly which node flagged it and why, not just the final state.
 */
export async function runNode<T>(
  context: { surface: string; node: string },
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    console.log({
      event: "graph_node",
      surface: context.surface,
      node: context.node,
      status: "ok",
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    console.log({
      event: "graph_node",
      surface: context.surface,
      node: context.node,
      status: "error",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** True only if every checker in this pass returned "pass". */
export function allChecksPassed(results: CheckResult[]): boolean {
  return results.every((result) => result.verdict === "pass");
}

const CHECKER_LABELS: Record<CheckResult["checkerKind"], string> = {
  fact: "Fact check",
  completeness: "Completeness check",
};

/**
 * Joins every flagged result's discrepancy, labeled by which checker raised
 * it — this is what feeds `sendFollowUp`'s regeneration message (the model
 * needs to see BOTH problems at once, not just the first one found) and
 * what a founder ultimately sees on a `needs_review` outcome.
 */
export function combineFlaggedMessage(results: CheckResult[]): string {
  return results
    .filter((result) => result.verdict === "flagged")
    .map((result) => `${CHECKER_LABELS[result.checkerKind]}: ${result.discrepancy}`)
    .join("; ");
}
