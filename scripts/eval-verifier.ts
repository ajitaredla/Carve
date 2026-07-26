/**
 * Task 6.1b — Verifier reliability eval (per 5.7's product review).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEFERRED / MANUAL STEP — NOT RUN AS PART OF THIS BUILD. DO NOT FAKE RESULTS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This environment has no live Managed Agents access (no deployed `/api/mcp`
 * — see task 6.0b: deployment to Azure is the user's job, on their own
 * timeline, and both agent YAMLs still point at a placeholder
 * `mcp_server_url`). This script is written to WORK once that's live; it has
 * never been executed here, and its expected/actual columns must never be
 * filled in with invented numbers. Nobody should read a result out of this
 * file until it has actually been run.
 *
 * ---------------------------------------------------------------------------
 * Why this eval exists (5.7's finding)
 * ---------------------------------------------------------------------------
 *
 * The verifier is more failure-sensitive than the generator: a missed
 * verification error becomes a silent false PASS (worse than no verification
 * at all — it manufactures false confidence in flagged-but-unflagged
 * content), whereas a generator mistake at least has a chance of being
 * caught downstream. Both agents use the cheapest model tier
 * (`claude-haiku-4-5`, task 5.0's explicit cost choice). Before 6.4 ships all
 * six FR-05 document types on that same cheap-tier verifier, this eval
 * checks whether Haiku actually catches fabricated/altered facts at an
 * acceptable rate. If it doesn't, 5.7's review is explicit: escalate ONLY the
 * verifier to a stronger model — the generator's model choice is unaffected.
 *
 * ---------------------------------------------------------------------------
 * How to run this once the deploy (6.0b) is live
 * ---------------------------------------------------------------------------
 *
 *   1. Update both agent YAMLs' `mcp_servers[0].url` and the vault
 *      credential's `mcp_server_url` to the real deployed origin (6.0b).
 *   2. Ensure `.env` has real `CARVE_*_AGENT_ID`, `CARVE_ENVIRONMENT_ID`,
 *      `CARVE_VAULT_ID`, and Anthropic API credentials.
 *   3. Install a TS script runner if one isn't already a dependency, e.g.
 *      `npm i -D tsx`, then: `npx tsx scripts/eval-verifier.ts`
 *      (or adapt to whatever runner the deploy environment already uses).
 *   4. This script provisions its OWN throwaway Founder/Brand/Retailer/
 *      Assessment/CostWaterfall fixture via Prisma (so `get_verification_facts`
 *      and `get_retailer_requirements` have real, consistent ground truth to
 *      check the eval cases' text against), runs every case in `EVAL_CASES`
 *      below through `runVerifierSession`, and deletes the fixture rows
 *      afterward (a `finally` block — cleanup runs even if a case throws).
 *   5. Read the printed accuracy report. Pay special attention to FALSE
 *      NEGATIVES (a known-bad case the verifier marked PASS) — those are the
 *      dangerous failure mode per 5.7's finding above, more so than false
 *      positives (a known-good case incorrectly flagged, which is merely an
 *      unnecessary regeneration, not a silent bad output reaching a founder).
 *   6. If the false-negative rate is meaningfully non-zero, escalate
 *      `agents/carve-verifier.agent.yaml`'s `model` field (only that file),
 *      re-create the agent, update `CARVE_VERIFIER_AGENT_ID`, and re-run this
 *      script to confirm the improvement before considering 6.4 done.
 *
 * ---------------------------------------------------------------------------
 * The 8 cases below
 * ---------------------------------------------------------------------------
 *
 * Built around one fixed fixture: a retailer requiring a 40% minimum gross
 * margin, a brand with a $4.50 wholesale / $10 retail price (actual margin
 * 55%), no co-manufacturer, a 90-day lead time, a KeHE relationship with EDI
 * but no EFT capability, and no UNFI relationship — plus one waterfall run
 * computed from fixed cost inputs (see `FIXTURE_WATERFALL_INPUT` below; the
 * "correct" founderMarginPct/investorVerdict a GOOD case must cite is
 * computed with the real `calculateWaterfall`, never hand-typed, so the
 * fixture and the eval cases can never silently drift apart).
 *
 * 4 blocker-statement-style cases + 4 waterfall-verdict-style cases: for
 * each pairing, one GOOD case (every cited fact matches ground truth,
 * expected PASS) and one BAD case (exactly one fact fabricated or altered,
 * expected FLAGGED) — 8 total, satisfying "at least 6-8 realistic test
 * cases" with deliberately matched good/bad pairs so the eval isolates
 * exactly one discrepancy per bad case at a time.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { runVerifierSession } from "@/lib/agents/session";
import { calculateWaterfall } from "@/lib/waterfall/calculator";
import type { WaterfallInput, WaterfallResult } from "@/lib/waterfall/types";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const FIXTURE_WATERFALL_INPUT: WaterfallInput = {
  factoryCost: 1.0,
  coPackingFee: 0.5,
  freightToDc: 0.25,
  distributorMarkupPct: 20,
  retailerMarginPct: 40,
  chargebackEstimate: 0.1,
  msrp: 5.0,
};

interface Fixture {
  founderId: string;
  brandId: string;
  retailerId: string;
  retailerSlug: string;
  assessmentId: string;
  costWaterfallId: string;
}

async function createFixture(): Promise<Fixture> {
  const founder = await prisma.founder.create({
    data: {
      id: randomUUID(),
      email: `eval-verifier-fixture-${randomUUID()}@example.com`,
      name: "Eval Verifier Fixture Founder",
    },
  });

  const brand = await prisma.brand.create({
    data: {
      founderId: founder.id,
      name: "Eval Fixture Brand",
      category: "snacks",
      dtcAnnualRevenue: 400000,
      wholesalePrice: 4.5,
      retailPrice: 10,
      hasKeheRelationship: true,
      hasUnfiRelationship: false,
      ediCapable: true,
      eftCapable: false,
      heldCertifications: ["usda_organic"],
      isDtcOnly: false,
      unitsPerStorePerWeek: 4,
      hasCoManufacturer: false,
      leadTimeDays: 90,
      hasRegionalProductionCapacity: false,
    },
  });

  const retailerSlug = `eval-fixture-retailer-${randomUUID()}`;
  const retailer = await prisma.retailer.create({
    data: {
      slug: retailerSlug,
      name: "Eval Fixture Retailer",
      requirements: {
        minGrossMarginPct: 40,
        requiredCertifications: ["usda_organic"],
        submissionWindow: { open: true, daysUntilNextWindow: null },
      },
    },
  });

  const waterfall = calculateWaterfall(FIXTURE_WATERFALL_INPUT);

  const assessment = await prisma.assessment.create({
    data: {
      brandId: brand.id,
      retailerId: retailer.id,
      retailerDataVersion: retailer.updatedAt.toISOString(),
      overallScore: 60,
      marginScore: 90,
      distributorScore: 80,
      certificationScore: 100,
      timingScore: 100,
      velocityScore: 70,
      fulfillmentScore: 20,
      blockerDimension: "fulfillment",
      blockerStatement:
        "Your $4.50 wholesale gives this retailer 55% margin — well above " +
        "their 40% minimum. The real blocker is fulfillment: you have no " +
        "co-manufacturer and a 90-day production lead time.",
    },
  });

  const costWaterfall = await prisma.costWaterfall.create({
    data: {
      assessmentId: assessment.id,
      factoryCost: FIXTURE_WATERFALL_INPUT.factoryCost,
      coPackingFee: FIXTURE_WATERFALL_INPUT.coPackingFee,
      freightToDc: FIXTURE_WATERFALL_INPUT.freightToDc,
      distributorMarkupPct: FIXTURE_WATERFALL_INPUT.distributorMarkupPct,
      retailerMarginPct: FIXTURE_WATERFALL_INPUT.retailerMarginPct,
      chargebackEstimate: FIXTURE_WATERFALL_INPUT.chargebackEstimate,
      msrp: FIXTURE_WATERFALL_INPUT.msrp,
      founderMarginPct: waterfall.founderMarginPct,
      investorVerdict: waterfall.investorVerdict,
      verdictStatement: `Founder margin of ${waterfall.founderMarginPct.toFixed(1)}% — investor verdict: ${waterfall.investorVerdict}.`,
    },
  });

  return {
    founderId: founder.id,
    brandId: brand.id,
    retailerId: retailer.id,
    retailerSlug,
    assessmentId: assessment.id,
    costWaterfallId: costWaterfall.id,
  };
}

async function destroyFixture(fixture: Fixture): Promise<void> {
  // Delete children before parents — no ON DELETE CASCADE configured in the
  // schema, so this must be explicit and in dependency order.
  await prisma.generationLog.deleteMany({
    where: { assessmentId: fixture.assessmentId },
  });
  await prisma.costWaterfall.deleteMany({
    where: { assessmentId: fixture.assessmentId },
  });
  await prisma.assessment.delete({ where: { id: fixture.assessmentId } });
  await prisma.retailer.delete({ where: { id: fixture.retailerId } });
  await prisma.brand.delete({ where: { id: fixture.brandId } });
  await prisma.founder.delete({ where: { id: fixture.founderId } });
}

// ---------------------------------------------------------------------------
// Eval cases
// ---------------------------------------------------------------------------

interface EvalCase {
  id: string;
  description: string;
  expected: "PASS" | "FLAGGED";
  buildPrompt(fixture: Fixture, waterfall: WaterfallResult): string;
}

function verifyPrompt(
  fixture: Fixture,
  text: string,
  isWaterfallCase = false,
): string {
  return [
    `Verify this ${isWaterfallCase ? "waterfall verdict" : "blocker"} statement ` +
      `against assessment ${fixture.assessmentId} (brandId: ${fixture.brandId}` +
      (isWaterfallCase ? `, costWaterfallId: ${fixture.costWaterfallId}` : "") +
      ").",
    "",
    `--- BEGIN GENERATED TEXT ---\n${text}\n--- END GENERATED TEXT ---`,
  ].join("\n");
}

const EVAL_CASES: EvalCase[] = [
  {
    id: "blocker-good-margin",
    description:
      "Blocker statement citing the CORRECT margin (55% actual vs 40% minimum).",
    expected: "PASS",
    buildPrompt: (f) =>
      verifyPrompt(
        f,
        "Your $4.50 wholesale gives this retailer 55% margin — that clears " +
          "their 40% minimum comfortably. The real blocker is fulfillment: " +
          "no co-manufacturer in place and a 90-day production lead time.",
      ),
  },
  {
    id: "blocker-bad-margin",
    description:
      "Blocker statement FABRICATING the retailer's minimum margin (says 42% instead of the true 40%).",
    expected: "FLAGGED",
    buildPrompt: (f) =>
      verifyPrompt(
        f,
        "Your $4.50 wholesale gives this retailer 55% margin — that clears " +
          "their 42% minimum comfortably. The real blocker is fulfillment: " +
          "no co-manufacturer in place and a 90-day production lead time.",
      ),
  },
  {
    id: "blocker-good-fulfillment",
    description: "Blocker statement citing the CORRECT 90-day lead time.",
    expected: "PASS",
    buildPrompt: (f) =>
      verifyPrompt(
        f,
        "The real blocker is fulfillment: you have no co-manufacturer " +
          "relationship in place and a 90-day production lead time, well " +
          "beyond the 30-day maximum most retailers expect.",
      ),
  },
  {
    id: "blocker-bad-fulfillment",
    description:
      "Blocker statement ALTERING the lead time (says 60 days instead of the true 90).",
    expected: "FLAGGED",
    buildPrompt: (f) =>
      verifyPrompt(
        f,
        "The real blocker is fulfillment: you have no co-manufacturer " +
          "relationship in place and a 60-day production lead time.",
      ),
  },
  {
    id: "blocker-bad-distributor-relationship",
    description:
      "Blocker statement FABRICATING a UNFI relationship the fixture brand does not have.",
    expected: "FLAGGED",
    buildPrompt: (f) =>
      verifyPrompt(
        f,
        "With both KeHE and UNFI relationships already in place and EDI " +
          "capability established, distribution infrastructure is not your " +
          "blocker. The real blocker is fulfillment.",
      ),
  },
  {
    id: "waterfall-good-verdict",
    description:
      "Waterfall verdict citing the CORRECT investor verdict and founder margin (computed via calculateWaterfall, not hand-typed).",
    expected: "PASS",
    buildPrompt: (f, waterfall) =>
      verifyPrompt(
        f,
        `Founder margin comes in at ${waterfall.founderMarginPct.toFixed(1)}%, ` +
          `landing this brand in the "${waterfall.investorVerdict}" investor-` +
          "readiness bucket.",
        true,
      ),
  },
  {
    id: "waterfall-bad-verdict",
    description:
      "Waterfall verdict citing the WRONG investor verdict bucket.",
    expected: "FLAGGED",
    buildPrompt: (f, waterfall) => {
      const wrongVerdict =
        waterfall.investorVerdict === "pass" ? "fail" : "pass";
      return verifyPrompt(
        f,
        `Founder margin comes in at ${waterfall.founderMarginPct.toFixed(1)}%, ` +
          `landing this brand in the "${wrongVerdict}" investor-readiness bucket.`,
        true,
      );
    },
  },
  {
    id: "waterfall-bad-margin-figure",
    description:
      "Waterfall verdict citing a FABRICATED founder margin percentage different from the computed value.",
    expected: "FLAGGED",
    buildPrompt: (f, waterfall) => {
      const fabricated = (waterfall.founderMarginPct + 15).toFixed(1);
      return verifyPrompt(
        f,
        `Founder margin comes in at ${fabricated}%, landing this brand in ` +
          `the "${waterfall.investorVerdict}" investor-readiness bucket.`,
        true,
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface CaseOutcome {
  id: string;
  description: string;
  expected: "PASS" | "FLAGGED";
  actual: "PASS" | "FLAGGED" | "ERROR";
  correct: boolean;
  detail?: string;
}

async function runEval(): Promise<void> {
  console.log(
    "[eval-verifier] Provisioning throwaway fixture data (Founder/Brand/" +
      "Retailer/Assessment/CostWaterfall)...",
  );
  const fixture = await createFixture();
  const waterfall = calculateWaterfall(FIXTURE_WATERFALL_INPUT);

  const outcomes: CaseOutcome[] = [];

  try {
    for (const evalCase of EVAL_CASES) {
      const prompt = evalCase.buildPrompt(fixture, waterfall);
      console.log(`[eval-verifier] Running case: ${evalCase.id}`);

      try {
        const { result } = await runVerifierSession(prompt);
        const actual: "PASS" | "FLAGGED" = result === "PASS" ? "PASS" : "FLAGGED";
        outcomes.push({
          id: evalCase.id,
          description: evalCase.description,
          expected: evalCase.expected,
          actual,
          correct: actual === evalCase.expected,
          detail: typeof result === "object" ? result.flagged : undefined,
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
  } finally {
    console.log("[eval-verifier] Cleaning up fixture data...");
    await destroyFixture(fixture);
  }

  const total = outcomes.length;
  const correct = outcomes.filter((o) => o.correct).length;
  const falseNegatives = outcomes.filter(
    (o) => o.expected === "FLAGGED" && o.actual === "PASS",
  );
  const falsePositives = outcomes.filter(
    (o) => o.expected === "PASS" && o.actual === "FLAGGED",
  );

  console.log("\n=== carve-verifier reliability eval ===\n");
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
    `False negatives (dangerous — known-bad marked PASS): ${falseNegatives.length}`,
  );
  console.log(
    `False positives (known-good incorrectly flagged): ${falsePositives.length}`,
  );

  if (falseNegatives.length > 0) {
    console.log(
      "\n⚠️  At least one known-bad case was NOT caught. Per 5.7's product " +
        "review: escalate ONLY agents/carve-verifier.agent.yaml's model, not " +
        "the generator's, and re-run this script before considering 6.4 done.",
    );
  }
}

runEval()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[eval-verifier] Failed:", error);
    process.exit(1);
  });
