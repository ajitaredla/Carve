/**
 * carve-generator reliability eval (2026-08-15) — the gap flagged in the
 * same architecture review that led to today's verifier/spend/rate-limit
 * work: every eval built so far (scripts/eval-verifier.ts,
 * scripts/eval-completeness.ts) checks whether the CHECKERS catch bad
 * output. None of them check the GENERATOR itself — the component that
 * actually writes what a founder reads. This script does, using the
 * REAL, now-validated production pipeline (generateWithVerification /
 * generateDocumentWithChecks — not raw runGeneratorSession) as the judge,
 * since today's verifier eval confirmed 100% accuracy (0 false negatives,
 * 0 false positives) on the same 8-case suite. A `final` outcome means the
 * (validated) verifier and completeness checker were satisfied; a
 * `needs_review` outcome means the generator produced something wrong
 * twice in a row.
 *
 * Same multi-trial methodology as eval-verifier.ts, same reason: a single
 * run per scenario can't distinguish "the generator reliably gets this
 * right" from "it got lucky once." Each scenario runs TRIALS_PER_CASE
 * times and reports a final-on-first-try / final-after-regeneration /
 * needs_review RATE, not a single outcome.
 *
 * Two fixture scenarios, not one, to probe different generation
 * difficulty:
 *   - "clean": strong margins, one unambiguous blocker — the easy case.
 *   - "borderline": thin margins close to the retailer's minimum, a
 *     blocker with a less clear-cut story — probes whether ambiguity
 *     increases the generator's error rate.
 *
 * Covers both pipelines: generateWithVerification (blocker_statement) on
 * both scenarios, and generateDocumentWithChecks (kehe_application, the
 * 4-node fan-out/fan-in graph) on the clean scenario — bounded to one
 * document type to keep real API spend reasonable; the document graph's
 * fact+completeness fan-out means each trial there costs roughly 2x a
 * blocker-statement trial.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateWithVerification, wrapUntrustedField } from "@/lib/agents/generate";
import { generateDocumentWithChecks } from "@/lib/agents/document-graph";
import { calculateWaterfall } from "@/lib/waterfall/calculator";
import type { WaterfallInput } from "@/lib/waterfall/types";
import type { Certification } from "@prisma/client";

const TRIALS_PER_CASE = 3;

// ---------------------------------------------------------------------------
// Fixture scenarios
// ---------------------------------------------------------------------------

interface Scenario {
  id: string;
  description: string;
  brand: {
    wholesalePrice: number;
    retailPrice: number;
    hasCoManufacturer: boolean;
    leadTimeDays: number;
    heldCertifications: Certification[];
  };
  retailer: { minGrossMarginPct: number; requiredCertifications: string[] };
  blockerDimension: string;
  blockerScore: number;
  waterfallInput: WaterfallInput;
}

const SCENARIOS: Scenario[] = [
  {
    id: "clean",
    description: "Strong margins (55% vs 40% min), one unambiguous fulfillment blocker.",
    brand: {
      wholesalePrice: 4.5,
      retailPrice: 10,
      hasCoManufacturer: false,
      leadTimeDays: 90,
      heldCertifications: ["usda_organic"],
    },
    retailer: { minGrossMarginPct: 40, requiredCertifications: ["usda_organic"] },
    blockerDimension: "fulfillment",
    blockerScore: 20,
    waterfallInput: {
      factoryCost: 1.0,
      coPackingFee: 0.5,
      freightToDc: 0.25,
      distributorMarkupPct: 20,
      retailerMarginPct: 40,
      chargebackEstimate: 0.1,
      msrp: 5.0,
    },
  },
  {
    id: "borderline",
    description: "Thin margins (41% vs 40% min — barely clears), certification blocker.",
    brand: {
      wholesalePrice: 5.9,
      retailPrice: 10,
      hasCoManufacturer: true,
      leadTimeDays: 21,
      heldCertifications: [],
    },
    retailer: { minGrossMarginPct: 40, requiredCertifications: ["usda_organic", "non_gmo"] },
    blockerDimension: "certification",
    blockerScore: 15,
    waterfallInput: {
      factoryCost: 2.8,
      coPackingFee: 0.3,
      freightToDc: 0.2,
      distributorMarkupPct: 15,
      retailerMarginPct: 40,
      chargebackEstimate: 0.05,
      msrp: 10.0,
    },
  },
];

interface Fixture {
  founderId: string;
  brandId: string;
  brandName: string;
  retailerId: string;
  retailerSlug: string;
  retailerName: string;
  assessmentId: string;
  costWaterfallId: string;
}

async function createFixture(scenario: Scenario): Promise<Fixture> {
  const founder = await prisma.founder.create({
    data: {
      id: randomUUID(),
      email: `eval-generator-fixture-${randomUUID()}@example.com`,
      name: "Eval Generator Fixture Founder",
    },
  });

  const brandName = `Eval Fixture Brand (${scenario.id})`;
  const brand = await prisma.brand.create({
    data: {
      founderId: founder.id,
      name: brandName,
      category: "snacks",
      dtcAnnualRevenue: 400000,
      wholesalePrice: scenario.brand.wholesalePrice,
      retailPrice: scenario.brand.retailPrice,
      hasKeheRelationship: true,
      hasUnfiRelationship: false,
      ediCapable: true,
      eftCapable: false,
      heldCertifications: scenario.brand.heldCertifications,
      isDtcOnly: false,
      unitsPerStorePerWeek: 4,
      hasCoManufacturer: scenario.brand.hasCoManufacturer,
      leadTimeDays: scenario.brand.leadTimeDays,
      hasRegionalProductionCapacity: false,
    },
  });

  const retailerSlug = `eval-generator-fixture-retailer-${randomUUID()}`;
  const retailerName = "Eval Fixture Retailer";
  const retailer = await prisma.retailer.create({
    data: {
      slug: retailerSlug,
      name: retailerName,
      requirements: {
        minGrossMarginPct: scenario.retailer.minGrossMarginPct,
        requiredCertifications: scenario.retailer.requiredCertifications,
        submissionWindow: { open: true, daysUntilNextWindow: null },
      },
    },
  });

  const waterfall = calculateWaterfall(scenario.waterfallInput);

  const assessment = await prisma.assessment.create({
    data: {
      brandId: brand.id,
      retailerId: retailer.id,
      retailerDataVersion: retailer.updatedAt.toISOString(),
      overallScore: 55,
      marginScore: 90,
      distributorScore: 80,
      certificationScore: scenario.blockerDimension === "certification" ? scenario.blockerScore : 90,
      timingScore: 90,
      velocityScore: 70,
      fulfillmentScore: scenario.blockerDimension === "fulfillment" ? scenario.blockerScore : 90,
      blockerDimension: scenario.blockerDimension,
      blockerStatement: "placeholder — overwritten by the eval, never read",
    },
  });

  const costWaterfall = await prisma.costWaterfall.create({
    data: {
      assessmentId: assessment.id,
      factoryCost: scenario.waterfallInput.factoryCost,
      coPackingFee: scenario.waterfallInput.coPackingFee,
      freightToDc: scenario.waterfallInput.freightToDc,
      distributorMarkupPct: scenario.waterfallInput.distributorMarkupPct,
      retailerMarginPct: scenario.waterfallInput.retailerMarginPct,
      chargebackEstimate: scenario.waterfallInput.chargebackEstimate,
      msrp: scenario.waterfallInput.msrp,
      founderMarginPct: waterfall.founderMarginPct,
      investorVerdict: waterfall.investorVerdict,
      verdictStatement: `Founder margin of ${waterfall.founderMarginPct.toFixed(1)}% — investor verdict: ${waterfall.investorVerdict}.`,
    },
  });

  return {
    founderId: founder.id,
    brandId: brand.id,
    brandName,
    retailerId: retailer.id,
    retailerSlug,
    retailerName,
    assessmentId: assessment.id,
    costWaterfallId: costWaterfall.id,
  };
}

async function destroyFixture(fixture: Fixture): Promise<void> {
  await prisma.generatedDocument.deleteMany({ where: { assessmentId: fixture.assessmentId } });
  await prisma.generationLog.deleteMany({ where: { assessmentId: fixture.assessmentId } });
  await prisma.costWaterfall.deleteMany({ where: { assessmentId: fixture.assessmentId } });
  await prisma.assessment.delete({ where: { id: fixture.assessmentId } });
  await prisma.retailer.delete({ where: { id: fixture.retailerId } });
  await prisma.brand.delete({ where: { id: fixture.brandId } });
  await prisma.founder.delete({ where: { id: fixture.founderId } });
}

// ---------------------------------------------------------------------------
// Prompt builders — mirror actions/assessment.ts's / actions/documents.ts's
// real shape (this eval builds its own, same precedent as eval-verifier.ts,
// rather than importing those files' Prisma-coupled internals).
// ---------------------------------------------------------------------------

function blockerKickoffPrompt(fixture: Fixture, scenario: Scenario): string {
  return [
    `Write the single-blocker statement (FR-03) for the brand named below ` +
      `(brandId: ${fixture.brandId}) targeting ${fixture.retailerName} ` +
      `(retailerSlug: "${fixture.retailerSlug}").`,
    "",
    wrapUntrustedField("Brand name", fixture.brandName),
    "",
    `Carve's scoring engine has already determined the single highest-priority ` +
      `blocker is the "${scenario.blockerDimension}" dimension.`,
    "",
    "Before writing, call get_retailer_requirements and get_brand_context to " +
      "confirm the exact current facts — do not rely on the numbers in this " +
      "prompt alone.",
    "",
    "Write 2-4 sentences in plain, founder-facing language with specific numbers.",
  ].join("\n");
}

function blockerVerifyPrompt(fixture: Fixture, text: string): string {
  return [
    `Verify this blocker statement against assessment ${fixture.assessmentId} ` +
      `(brandId: ${fixture.brandId}).`,
    "",
    `--- BEGIN GENERATED TEXT ---\n${text}\n--- END GENERATED TEXT ---`,
  ].join("\n");
}

function keheKickoffPrompt(fixture: Fixture): string {
  return [
    `Write a KeHE application email for the brand named below (brandId: ` +
      `${fixture.brandId}) targeting ${fixture.retailerName} (retailerSlug: ` +
      `"${fixture.retailerSlug}").`,
    "",
    wrapUntrustedField("Brand name", fixture.brandName),
    "",
    "Before writing, call get_brand_context and get_retailer_requirements to " +
      "confirm current facts.",
    "",
    "Include: a brief brand introduction, key product details (category, " +
      "price point), the brand's distribution goal (target retailer and " +
      "why), an explicit statement of why the brand fits KeHE's natural/" +
      "specialty portfolio, and a subject line (this must read as a " +
      "ready-to-send email).",
  ].join("\n");
}

function keheVerifyPrompt(fixture: Fixture, text: string): string {
  return [
    `Verify this KeHE application against assessment ${fixture.assessmentId} ` +
      `(brandId: ${fixture.brandId}).`,
    "",
    `--- BEGIN GENERATED TEXT ---\n${text}\n--- END GENERATED TEXT ---`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

type Outcome = "final_first_try" | "final_after_regen" | "needs_review" | "error";

interface TrialResult {
  outcome: Outcome;
  detail?: string;
}

interface CaseSummary {
  id: string;
  description: string;
  trials: TrialResult[];
}

function summarize(trials: TrialResult[]): Record<Outcome, number> {
  const counts: Record<Outcome, number> = {
    final_first_try: 0,
    final_after_regen: 0,
    needs_review: 0,
    error: 0,
  };
  for (const trial of trials) counts[trial.outcome]++;
  return counts;
}

async function runBlockerTrial(fixture: Fixture, scenario: Scenario): Promise<TrialResult> {
  try {
    const result = await generateWithVerification(
      blockerKickoffPrompt(fixture, scenario),
      (text) => blockerVerifyPrompt(fixture, text),
      {
        surface: "blocker_statement",
        promptVersion: "eval",
        retailerDataVersion: new Date().toISOString(),
        brandInputSnapshot: {},
      },
    );
    if (result.status === "final") {
      return {
        outcome: result.canonicalLogEntryIndex === 0 ? "final_first_try" : "final_after_regen",
        detail: result.text,
      };
    }
    return { outcome: "needs_review", detail: result.lastDiscrepancy };
  } catch (error) {
    return { outcome: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function runKeheTrial(fixture: Fixture): Promise<TrialResult> {
  try {
    const result = await generateDocumentWithChecks(
      keheKickoffPrompt(fixture),
      (text) => keheVerifyPrompt(fixture, text),
      "kehe_application",
      {
        surface: "kehe_application",
        promptVersion: "eval",
        retailerDataVersion: new Date().toISOString(),
        brandInputSnapshot: {},
      },
    );
    if (result.status === "final") {
      return {
        outcome: result.canonicalLogEntryIndex === 0 ? "final_first_try" : "final_after_regen",
        detail: result.text,
      };
    }
    return { outcome: "needs_review", detail: result.discrepancy };
  } catch (error) {
    return { outcome: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function runEval(): Promise<void> {
  if (process.env.CARVE_MOCK_AGENTS === "1") {
    throw new Error(
      "This eval measures the REAL generator's reliability — refusing to " +
        "run with CARVE_MOCK_AGENTS=1, which would just replay canned text.",
    );
  }

  const cases: CaseSummary[] = [];
  const fixtures: Fixture[] = [];

  try {
    for (const scenario of SCENARIOS) {
      console.log(`[eval-generator] Provisioning fixture: ${scenario.id}...`);
      const fixture = await createFixture(scenario);
      fixtures.push(fixture);

      console.log(`[eval-generator] Running blocker_statement x${TRIALS_PER_CASE}: ${scenario.id}`);
      const blockerTrials = await Promise.all(
        Array.from({ length: TRIALS_PER_CASE }, () => runBlockerTrial(fixture, scenario)),
      );
      cases.push({
        id: `blocker_statement:${scenario.id}`,
        description: scenario.description,
        trials: blockerTrials,
      });

      if (scenario.id === "clean") {
        console.log(`[eval-generator] Running kehe_application x${TRIALS_PER_CASE}: ${scenario.id}`);
        const keheTrials = await Promise.all(
          Array.from({ length: TRIALS_PER_CASE }, () => runKeheTrial(fixture)),
        );
        cases.push({
          id: `kehe_application:${scenario.id}`,
          description: `${scenario.description} (document-graph pipeline)`,
          trials: keheTrials,
        });
      }
    }
  } finally {
    console.log("[eval-generator] Cleaning up fixtures...");
    for (const fixture of fixtures) {
      await destroyFixture(fixture);
    }
  }

  console.log("\n=== carve-generator reliability eval (multi-trial, real pipeline) ===\n");
  let totalTrials = 0;
  let totalFinal = 0;
  let totalNeedsReview = 0;
  let totalError = 0;

  for (const c of cases) {
    const counts = summarize(c.trials);
    const finalCount = counts.final_first_try + counts.final_after_regen;
    totalTrials += c.trials.length;
    totalFinal += finalCount;
    totalNeedsReview += counts.needs_review;
    totalError += counts.error;

    console.log(
      `[${finalCount}/${c.trials.length} final] ${c.id} — ` +
        `${counts.final_first_try} first-try, ${counts.final_after_regen} after-regen, ` +
        `${counts.needs_review} needs_review, ${counts.error} error`,
    );
    console.log(`       ${c.description}`);
    for (const trial of c.trials) {
      if (trial.outcome === "needs_review" || trial.outcome === "error") {
        console.log(`       -> ${trial.outcome}: ${trial.detail}`);
      }
    }
  }

  console.log(
    `\nOverall: ${totalFinal}/${totalTrials} final (${((totalFinal / totalTrials) * 100).toFixed(1)}%), ` +
      `${totalNeedsReview} needs_review, ${totalError} error`,
  );
  if (totalNeedsReview + totalError > 0) {
    console.log(
      "\nA needs_review/error rate above zero here is a real, measured " +
        "generator reliability number — not a bug in this script. Read the " +
        "flagged discrepancies above before deciding whether to act on it.",
    );
  }
}

runEval()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[eval-generator] Failed:", error);
    process.exit(1);
  });
