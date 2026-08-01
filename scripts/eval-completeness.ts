/**
 * Completeness-checker reliability eval — same motivation as
 * `scripts/eval-verifier.ts` (PRD's own precedent: "an eval pass is planned
 * before all FR-05 document types ship" applies equally to a second
 * cheap-tier checker, not just the first). A missed FLAGGED (a genuinely
 * incomplete document marked complete) is the dangerous failure mode — it
 * manufactures false confidence, the same as a verifier false PASS.
 *
 * Unlike eval-verifier.ts, this needs NO database fixture and NO Managed
 * Agents session — `runCompletenessCheck` only takes (documentType,
 * generatedText), so this script can (and, unlike eval-verifier.ts at the
 * time it was written, actually does) run for real: `npx tsx
 * scripts/eval-completeness.ts`.
 *
 * 6 GOOD cases (one per document type, containing everything its checklist
 * requires) + 6 BAD cases (the same text with exactly one required element
 * removed) — 12 total, one matched pair per document type so the eval
 * isolates a single missing element at a time, same design principle as
 * eval-verifier.ts's good/bad pairing.
 */

import { runCompletenessCheck } from "@/lib/agents/completeness";
import type { DocumentType } from "@/lib/documents/types";

interface EvalCase {
  id: string;
  documentType: DocumentType;
  expected: "complete" | "incomplete";
  description: string;
  text: string;
}

const EVAL_CASES: EvalCase[] = [
  {
    id: "kehe-good",
    documentType: "kehe_application",
    expected: "complete",
    description: "KeHE application with every required element present.",
    text: [
      "Subject: Introducing Fixture Brand to KeHE's Natural Portfolio",
      "",
      "Hi KeHE team,",
      "Fixture Brand is a $400K DTC snack company launching a regenerative spice blend.",
      "We're a natural, organic snack brand at the $10 price point, seeking distribution through KeHE Elevate.",
      "Our goal is to reach Sprouts and Whole Foods within the next two quarters.",
      "We believe we're a strong fit for KeHE's natural/specialty portfolio given our USDA Organic certification and clean-label positioning.",
      "Best,\nFixture Brand",
    ].join("\n"),
  },
  {
    id: "kehe-bad-no-subject",
    documentType: "kehe_application",
    expected: "incomplete",
    description: "Same KeHE application, but with the subject line removed.",
    text: [
      "Hi KeHE team,",
      "Fixture Brand is a $400K DTC snack company launching a regenerative spice blend.",
      "We're a natural, organic snack brand at the $10 price point, seeking distribution through KeHE Elevate.",
      "Our goal is to reach Sprouts and Whole Foods within the next two quarters.",
      "We believe we're a strong fit for KeHE's natural/specialty portfolio given our USDA Organic certification and clean-label positioning.",
      "Best,\nFixture Brand",
    ].join("\n"),
  },
  {
    id: "sprouts-good",
    documentType: "sprouts_checklist",
    expected: "complete",
    description: "Sprouts checklist covering every category with done/not-done marks and next steps.",
    text: [
      "Sprouts Submission Checklist — Fixture Brand",
      "- Certifications (USDA Organic): DONE — certificate on file.",
      "- Margin (40% minimum): DONE — current wholesale price clears the minimum.",
      "- Distributor relationship (KeHE/UNFI): NOT DONE — no UNFI relationship yet. Next step: apply via KeHE Elevate at kehe.com/elevate.",
      "- Submission window: DONE — currently open.",
      "- Velocity/fulfillment: NOT DONE — no co-manufacturer in place. Next step: secure a co-packer before submitting.",
    ].join("\n"),
  },
  {
    id: "sprouts-bad-no-next-steps",
    documentType: "sprouts_checklist",
    expected: "incomplete",
    description: "Same checklist, but with next-step instructions removed for not-done items.",
    text: [
      "Sprouts Submission Checklist — Fixture Brand",
      "- Certifications (USDA Organic): DONE.",
      "- Margin (40% minimum): DONE.",
      "- Distributor relationship (KeHE/UNFI): NOT DONE.",
      "- Submission window: DONE.",
      "- Velocity/fulfillment: NOT DONE.",
    ].join("\n"),
  },
  {
    id: "wf-good",
    documentType: "wf_pitch_brief",
    expected: "complete",
    description: "Whole Foods pitch brief with all five required sections.",
    text: [
      "Whole Foods Buyer Pitch Brief — Fixture Brand",
      "Category gap: no regenerative-sourced spice blend currently in this set.",
      "Velocity proof: 4 units/store/week on DTC channel-comparable data.",
      "Margin scenario: 55% retailer margin at current wholesale pricing, well above the 40% minimum.",
      "Launch support plan: in-store demos twice monthly, social co-marketing.",
      "Brand story: founded by a third-generation spice farmer bringing regenerative agriculture to the shelf.",
    ].join("\n"),
  },
  {
    id: "wf-bad-no-launch-support",
    documentType: "wf_pitch_brief",
    expected: "incomplete",
    description: "Same pitch brief, but with the launch support plan section removed.",
    text: [
      "Whole Foods Buyer Pitch Brief — Fixture Brand",
      "Category gap: no regenerative-sourced spice blend currently in this set.",
      "Velocity proof: 4 units/store/week on DTC channel-comparable data.",
      "Margin scenario: 55% retailer margin at current wholesale pricing, well above the 40% minimum.",
      "Brand story: founded by a third-generation spice farmer bringing regenerative agriculture to the shelf.",
    ].join("\n"),
  },
  {
    id: "sellsheet-good",
    documentType: "sell_sheet_outline",
    expected: "complete",
    description: "Sell sheet outline with all six required sections, written as real copy.",
    text: [
      "[Product image placeholder: 3 SKU variants, front-facing]",
      "Key claims: USDA Organic, Non-GMO, single-origin spice blend.",
      "Pricing: $10 MSRP, case pack of 12, wholesale $4.50/unit.",
      "Distributor availability: KeHE (EDI-capable), UNFI application in progress.",
      "Contact: sales@fixturebrand.example, (555) 010-0100.",
    ].join("\n"),
  },
  {
    id: "sellsheet-bad-bullet-list-only",
    documentType: "sell_sheet_outline",
    expected: "incomplete",
    description: "Just a bare bullet list of what a sell sheet usually contains, no actual copy.",
    text: [
      "A sell sheet usually contains:",
      "- product images",
      "- claims",
      "- pricing",
      "- distributor info",
      "- contact info",
    ].join("\n"),
  },
  {
    id: "unfi-good",
    documentType: "unfi_application",
    expected: "complete",
    description: "UNFI application with company overview, product details, and distribution goals.",
    text: [
      "UNFI Supplier Application Draft — Fixture Brand",
      "Company overview: founded 2023, $400K DTC revenue, natural/organic snack category.",
      "Product details: regenerative spice blends, USDA Organic certified, case pack of 12, $4.50 wholesale.",
      "Distribution goals: seeking UNFI relationship to support Sprouts and Whole Foods submissions in the natural channel.",
    ].join("\n"),
  },
  {
    id: "unfi-bad-no-product-details",
    documentType: "unfi_application",
    expected: "incomplete",
    description: "Same application, but with product details removed.",
    text: [
      "UNFI Supplier Application Draft — Fixture Brand",
      "Company overview: founded 2023, $400K DTC revenue, natural/organic snack category.",
      "Distribution goals: seeking UNFI relationship to support Sprouts and Whole Foods submissions in the natural channel.",
    ].join("\n"),
  },
  {
    id: "buyer-email-good",
    documentType: "buyer_outreach_email",
    expected: "complete",
    description: "Buyer outreach email with a subject line and a specific ask, no hype.",
    text: [
      "Subject: Regenerative spice blend — sample request for your category review",
      "",
      "Hi [Buyer name],",
      "Fixture Brand is a regenerative-sourced spice line currently at $400K DTC revenue with a 55% margin at our current wholesale price.",
      "I'd like to send a sample case for your next category review — would that be useful, or would a 15-minute call work better first?",
      "Best,\nFixture Brand",
    ].join("\n"),
  },
  {
    id: "buyer-email-bad-no-ask",
    documentType: "buyer_outreach_email",
    expected: "incomplete",
    description: "Same email, but with the specific ask removed — just an introduction with no next step.",
    text: [
      "Subject: Regenerative spice blend",
      "",
      "Hi [Buyer name],",
      "Fixture Brand is a regenerative-sourced spice line currently at $400K DTC revenue with a 55% margin at our current wholesale price.",
      "Best,\nFixture Brand",
    ].join("\n"),
  },
];

interface CaseOutcome {
  id: string;
  description: string;
  expected: "complete" | "incomplete";
  actual: "complete" | "incomplete" | "ERROR";
  correct: boolean;
  detail?: string;
}

async function runEval(): Promise<void> {
  const outcomes: CaseOutcome[] = [];

  for (const evalCase of EVAL_CASES) {
    console.log(`[eval-completeness] Running case: ${evalCase.id}`);
    try {
      const result = await runCompletenessCheck(evalCase.documentType, evalCase.text);
      const actual: "complete" | "incomplete" =
        result.verdict === "pass" ? "complete" : "incomplete";
      outcomes.push({
        id: evalCase.id,
        description: evalCase.description,
        expected: evalCase.expected,
        actual,
        correct: actual === evalCase.expected,
        detail: result.verdict === "flagged" ? result.discrepancy : undefined,
      });
    } catch (error) {
      outcomes.push({
        id: evalCase.id,
        description: evalCase.description,
        expected: evalCase.expected,
        actual: "ERROR",
        correct: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const total = outcomes.length;
  const correct = outcomes.filter((o) => o.correct).length;
  const falseNegatives = outcomes.filter(
    (o) => o.expected === "incomplete" && o.actual === "complete",
  );
  const falsePositives = outcomes.filter(
    (o) => o.expected === "complete" && o.actual === "incomplete",
  );

  console.log("\n=== completeness-checker reliability eval ===\n");
  for (const outcome of outcomes) {
    const mark = outcome.correct ? "PASS" : "MISS";
    console.log(
      `[${mark}] ${outcome.id} — expected ${outcome.expected}, got ${outcome.actual}` +
        (outcome.detail ? ` (${outcome.detail})` : ""),
    );
    console.log(`       ${outcome.description}`);
  }

  console.log(
    `\nAccuracy: ${correct}/${total} (${((correct / total) * 100).toFixed(1)}%)`,
  );
  console.log(
    `False negatives (dangerous — genuinely incomplete marked complete): ${falseNegatives.length}`,
  );
  console.log(
    `False positives (genuinely complete incorrectly flagged): ${falsePositives.length}`,
  );

  if (falseNegatives.length > 0) {
    console.log(
      "\n⚠️  At least one genuinely incomplete document was marked complete. " +
        "Consider a stronger model for lib/agents/completeness.ts's " +
        "COMPLETENESS_MODEL before relying on this checker in production.",
    );
  }
}

runEval()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[eval-completeness] Failed:", error);
    process.exit(1);
  });
