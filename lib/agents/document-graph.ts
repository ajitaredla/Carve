/**
 * The document-generation graph — generate -> [fact_check, completeness_check]
 * (parallel) -> decide -> regenerate -> [fact_check, completeness_check]
 * (parallel) -> decide. Used ONLY by the 6 FR-05 document surfaces
 * (`actions/documents.ts`). `blocker_statement`/`waterfall_verdict` keep
 * using `lib/agents/generate.ts`'s unchanged 2-node
 * generate -> fact_check chain — they're free-form narrative/verdict text
 * with no fixed "must contain X, Y, Z" checklist, so the completeness
 * checker doesn't apply to them.
 *
 * Same retry policy as `generate.ts`: exactly ONE regeneration attempt, ever.
 * If either checker is still flagged after that, the result is
 * `needs_review` — never a third generation attempt.
 *
 * Reuses `lib/agents/session.ts`'s `runGeneratorSession`/`runVerifierSession`/
 * `sendFollowUp` unchanged (zero edits to that file) and
 * `lib/agents/completeness.ts`'s `runCompletenessCheck` (the new checker).
 */

import { runGeneratorSession, runVerifierSession, sendFollowUp } from "./session";
import { runCompletenessCheck, type CheckResult } from "./completeness";
import { runNode, allChecksPassed, combineFlaggedMessage } from "./graph";
import { GENERATION_MODEL, type GenerationLogEntry, type VerificationResultLabel } from "./generate";
import type { DocumentType } from "@/lib/documents/types";

export interface DocumentGraphOptions {
  surface: DocumentType;
  promptVersion: string;
  retailerDataVersion: string;
  brandInputSnapshot: Record<string, unknown>;
}

export interface DocumentGraphFinal {
  status: "final";
  text: string;
  generatorSessionId: string;
  logEntries: GenerationLogEntry[];
  /** Index into `logEntries` for the GENERATOR row whose `output` equals
   * `text` — same contract as `generate.ts`'s `canonicalLogEntryIndex`. */
  canonicalLogEntryIndex: number;
}

export interface DocumentGraphNeedsReview {
  status: "needs_review";
  /** Joined, labeled message — e.g. "Fact check: ...; Completeness check: ..."
   * — for existing UI components that already render a single discrepancy
   * string (`components/documents/document-card.tsx`). */
  discrepancy: string;
  /** Same information, split by checker, for finer-grained UI later. */
  discrepancies: { fact?: string; completeness?: string };
  logEntries: GenerationLogEntry[];
}

export type DocumentGraphResult = DocumentGraphFinal | DocumentGraphNeedsReview;

function normalizeFactResult(
  result: Awaited<ReturnType<typeof runVerifierSession>>["result"],
): CheckResult {
  if (result === "PASS") {
    return { checkerKind: "fact", verdict: "pass" };
  }
  return { checkerKind: "fact", verdict: "flagged", discrepancy: result.flagged };
}

function checkOutput(result: CheckResult): string {
  return result.verdict === "pass" ? "PASS" : `FLAGGED: ${result.discrepancy}`;
}

function checkVerificationResult(result: CheckResult): VerificationResultLabel {
  return result.verdict === "pass" ? "pass" : "flagged";
}

/** Runs both checkers in parallel against the same text, for one attempt. */
async function runChecks(
  surface: DocumentType,
  documentType: DocumentType,
  factVerifyPrompt: (text: string) => string,
  text: string,
): Promise<[CheckResult, CheckResult]> {
  const [fact, completeness] = await Promise.all([
    runNode({ surface, node: "fact_check" }, async () =>
      normalizeFactResult((await runVerifierSession(factVerifyPrompt(text))).result),
    ),
    runNode({ surface, node: "completeness_check" }, () =>
      runCompletenessCheck(documentType, text),
    ),
  ]);
  return [fact, completeness];
}

export async function generateDocumentWithChecks(
  kickoffPrompt: string,
  factVerifyPrompt: (text: string) => string,
  documentType: DocumentType,
  options: DocumentGraphOptions,
): Promise<DocumentGraphResult> {
  const buildEntry = (
    output: string,
    verificationResult: VerificationResultLabel,
    extra?: { checkerKind?: "fact" | "completeness"; attempt?: number },
  ): GenerationLogEntry => ({
    surface: options.surface,
    promptVersion: options.promptVersion,
    retailerDataVersion: options.retailerDataVersion,
    brandInputSnapshot: options.brandInputSnapshot,
    model: GENERATION_MODEL,
    output,
    verificationResult,
    ...extra,
  });

  // --- generate (attempt 1) --------------------------------------------
  const generation = await runNode(
    { surface: options.surface, node: "generate" },
    () => runGeneratorSession(kickoffPrompt),
  );

  const [fact1, completeness1] = await runChecks(
    options.surface,
    documentType,
    factVerifyPrompt,
    generation.text,
  );

  const logEntries: GenerationLogEntry[] = [];

  if (allChecksPassed([fact1, completeness1])) {
    logEntries.push(
      buildEntry(generation.text, "pass"),
      buildEntry(checkOutput(fact1), checkVerificationResult(fact1), {
        checkerKind: "fact",
        attempt: 1,
      }),
      buildEntry(checkOutput(completeness1), checkVerificationResult(completeness1), {
        checkerKind: "completeness",
        attempt: 1,
      }),
    );
    return {
      status: "final",
      text: generation.text,
      generatorSessionId: generation.sessionId,
      logEntries,
      canonicalLogEntryIndex: 0,
    };
  }

  // --- FLAGGED (by either or both checkers): regenerate once, same
  // generator session, feeding BOTH discrepancies back. -------------------
  const combinedDiscrepancy1 = combineFlaggedMessage([fact1, completeness1]);
  logEntries.push(
    buildEntry(generation.text, "regenerated"),
    buildEntry(checkOutput(fact1), checkVerificationResult(fact1), {
      checkerKind: "fact",
      attempt: 1,
    }),
    buildEntry(checkOutput(completeness1), checkVerificationResult(completeness1), {
      checkerKind: "completeness",
      attempt: 1,
    }),
  );

  const correction = await runNode(
    { surface: options.surface, node: "regenerate" },
    () =>
      sendFollowUp(
        generation.sessionId,
        `Your previous attempt was flagged: ${combinedDiscrepancy1}. Please ` +
          "regenerate, correcting these specific issues.",
      ),
  );

  const [fact2, completeness2] = await runChecks(
    options.surface,
    documentType,
    factVerifyPrompt,
    correction.text,
  );

  if (allChecksPassed([fact2, completeness2])) {
    const correctionEntryIndex = logEntries.length;
    logEntries.push(
      buildEntry(correction.text, "pass"),
      buildEntry(checkOutput(fact2), checkVerificationResult(fact2), {
        checkerKind: "fact",
        attempt: 2,
      }),
      buildEntry(checkOutput(completeness2), checkVerificationResult(completeness2), {
        checkerKind: "completeness",
        attempt: 2,
      }),
    );
    return {
      status: "final",
      text: correction.text,
      generatorSessionId: generation.sessionId,
      logEntries,
      canonicalLogEntryIndex: correctionEntryIndex,
    };
  }

  // Flagged again -> needs_review. Never a third attempt.
  logEntries.push(
    buildEntry(correction.text, "failed"),
    buildEntry(checkOutput(fact2), checkVerificationResult(fact2), {
      checkerKind: "fact",
      attempt: 2,
    }),
    buildEntry(checkOutput(completeness2), checkVerificationResult(completeness2), {
      checkerKind: "completeness",
      attempt: 2,
    }),
  );

  return {
    status: "needs_review",
    discrepancy: combineFlaggedMessage([fact2, completeness2]),
    discrepancies: {
      fact: fact2.verdict === "flagged" ? fact2.discrepancy : undefined,
      completeness:
        completeness2.verdict === "flagged" ? completeness2.discrepancy : undefined,
    },
    logEntries,
  };
}
