/**
 * Task 7.4 — founder-facing display labels + short descriptions for each
 * FR-05 document type, kept separate from `actions/documents.ts` (which owns
 * the six kickoff prompts) the same way `lib/scoring/dimension-labels.ts` and
 * `lib/certifications.ts` keep UI copy out of their respective calculation/
 * generation layers.
 *
 * `sprouts_checklist` / `wf_pitch_brief` are the two `DocumentType` values
 * whose literal name is a specific retailer (Sprouts / Whole Foods) even
 * though — per 6.8's product review MUST-FIX — their actual generated
 * content is now correctly personalized to the assessment's REAL target
 * retailer (`${ctx.retailer.name}`), not a hardcoded one. Labeling these
 * generically ("Retailer Submission Checklist" / "Buyer Pitch Brief") avoids
 * reintroducing the same class of confusion 6.8 just fixed in the prompt
 * layer — a founder assessing Trader Joe's should not see a document card
 * titled "Sprouts" when its actual content is about Trader Joe's. KeHE and
 * UNFI keep their real names because those documents are genuinely about
 * those specific distributors, independent of the assessment's target
 * retailer.
 */

import type { DocumentType } from "@/lib/documents/types";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  kehe_application: "KeHE Elevate Application",
  sprouts_checklist: "Retailer Submission Checklist",
  wf_pitch_brief: "Buyer Pitch Brief",
  sell_sheet_outline: "Sell Sheet Outline",
  unfi_application: "UNFI Application Draft",
  buyer_outreach_email: "Buyer Outreach Email",
};

export const DOCUMENT_TYPE_DESCRIPTIONS: Record<DocumentType, string> = {
  kehe_application:
    "A ready-to-send email to KeHE Distributors' new brand intake team, tailored to your brand.",
  sprouts_checklist:
    "Every requirement your target retailer states for your category, marked done or not-done against your current facts.",
  wf_pitch_brief:
    "A one-page buyer pitch: category gap, velocity proof, margin scenario, and a launch support plan.",
  sell_sheet_outline:
    "Section-by-section copy for a retail-ready sell sheet — images placeholder, claims, pricing, distributor availability.",
  unfi_application:
    "A ready-to-submit UNFI supplier application draft covering your company and product details.",
  buyer_outreach_email:
    "A direct, specific cold outreach email to a category buyer, with one clear ask.",
};
