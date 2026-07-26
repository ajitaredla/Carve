"use server";

/**
 * Task 7.2/7.3 — thin error-triage wrappers around `generateBlockerStatement`
 * (`actions/assessment.ts`) and `generateWaterfallVerdict` (`actions/
 * waterfall.ts`) for the "regenerate" actions the assessment/waterfall views
 * expose to a founder. Both underlying actions THROW on their known error
 * paths (`ScoringInputMappingError`, "no retailer found", `AgentSessionError`
 * session failures) rather than returning an `error` state the way `actions/
 * documents.ts` does — per 6.9's architect review, this is NOT covered by
 * 7.4a's fix (which is scoped to `documents.ts` only). This file is where
 * 7.2/7.3's own try/catch + friendly-message triage lives, so neither view
 * has to duplicate it, and so a future 7.4a-style fix to `documents.ts` has
 * a ready-made helper (`lib/errors/friendly.ts`) to adopt instead of
 * re-deriving its own classification.
 *
 * Deliberately separate from `actions/assessment.ts` / `actions/
 * waterfall.ts` themselves rather than modifying them in place — those files
 * are 6.2/6.3's already-reviewed, already-tested surfaces (their throwing
 * contract is asserted by `assessment.test.ts` / `waterfall.test.ts`); this
 * wrapper layer is purely additive UI plumbing.
 */

import {
  generateBlockerStatement,
  type GenerateBlockerStatementResult,
} from "@/actions/assessment";
import {
  generateWaterfallVerdict,
  type GenerateWaterfallVerdictInput,
  type GenerateWaterfallVerdictResult,
} from "@/actions/waterfall";
import {
  generateAllDocuments,
  generateBuyerOutreachEmail,
  generateKeheApplication,
  generateSellSheetOutline,
  generateSproutsChecklist,
  generateUnfiApplication,
  generateWfPitchBrief,
  type DocumentType,
  type GenerateDocumentResult,
} from "@/actions/documents";
import { toFriendlyGenerationError } from "@/lib/errors/friendly";

export type SafeBlockerStatementResult =
  | GenerateBlockerStatementResult
  | { status: "error"; message: string };

export async function generateBlockerStatementSafe(
  retailerSlug: string,
): Promise<SafeBlockerStatementResult> {
  try {
    return await generateBlockerStatement(retailerSlug);
  } catch (error) {
    const friendly = toFriendlyGenerationError(
      error,
      "generateBlockerStatementSafe",
    );
    return { status: "error", message: friendly.message };
  }
}

export type SafeWaterfallVerdictResult =
  | GenerateWaterfallVerdictResult
  | { status: "error"; message: string };

export async function generateWaterfallVerdictSafe(
  input: GenerateWaterfallVerdictInput,
): Promise<SafeWaterfallVerdictResult> {
  try {
    return await generateWaterfallVerdict(input);
  } catch (error) {
    const friendly = toFriendlyGenerationError(
      error,
      "generateWaterfallVerdictSafe",
    );
    return { status: "error", message: friendly.message };
  }
}

// ---------------------------------------------------------------------------
// Task 7.4 — document generation wrappers.
// ---------------------------------------------------------------------------
//
// Unlike `generateBlockerStatement`/`generateWaterfallVerdict` above,
// `actions/documents.ts`'s own functions already never REJECT on a
// per-document generation failure — `runOneDocument`'s internal try/catch
// (7.4a's fix) resolves an `{status: "error", documentType, message}` with
// an already-triaged, founder-safe message instead. The wrappers below still
// need their OWN try/catch, though: `loadDocumentContext` (assessment
// lookup, ownership check) runs BEFORE `runOneDocument`'s try/catch and CAN
// throw (e.g. "no assessment found", "does not belong to the current
// brand") — same defense-in-depth posture as the two wrappers above, just
// covering a narrower surface since 7.4a already closed the main leak risk
// inside `runOneDocument` itself.

export type SafeGenerateAllDocumentsResult =
  | GenerateDocumentResult[]
  | { status: "error"; message: string };

/** Backs 7.4's "Generate all documents" button — one call, 6 independent
 * per-document results (see `actions/documents.ts`'s 6.1c file header). */
export async function generateAllDocumentsSafe(
  assessmentId: string,
): Promise<SafeGenerateAllDocumentsResult> {
  try {
    return await generateAllDocuments(assessmentId);
  } catch (error) {
    const friendly = toFriendlyGenerationError(
      error,
      "generateAllDocumentsSafe",
    );
    return { status: "error", message: friendly.message };
  }
}

const DOCUMENT_GENERATORS: Record<
  DocumentType,
  (assessmentId: string) => Promise<GenerateDocumentResult>
> = {
  kehe_application: generateKeheApplication,
  sprouts_checklist: generateSproutsChecklist,
  wf_pitch_brief: generateWfPitchBrief,
  sell_sheet_outline: generateSellSheetOutline,
  unfi_application: generateUnfiApplication,
  buyer_outreach_email: generateBuyerOutreachEmail,
};

/** Backs 7.4's per-card "Generate"/"Regenerate" button — lets a founder
 * (re)run a single document without re-running all six. The return shape is
 * exactly `GenerateDocumentResult` (its own `"error"` status already carries
 * a documentType + a 7.4a-triaged message) — the try/catch here only ever
 * needs to add that same shape for the pre-`runOneDocument` throw case
 * (`loadDocumentContext`), not invent a different one. */
export async function generateOneDocumentSafe(
  documentType: DocumentType,
  assessmentId: string,
): Promise<GenerateDocumentResult> {
  try {
    return await DOCUMENT_GENERATORS[documentType](assessmentId);
  } catch (error) {
    const friendly = toFriendlyGenerationError(
      error,
      `generateOneDocumentSafe:${documentType}`,
    );
    return { status: "error", documentType, message: friendly.message };
  }
}
