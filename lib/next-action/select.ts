import type { Brand, Retailer } from "@prisma/client";

import {
  scoreDimensionsSafe,
  toScoringInput,
} from "@/lib/scoring/map-retailer-requirements";
import { selectBlocker } from "@/lib/scoring/blocker";
import type { BlockerResult } from "@/lib/scoring/blocker";
import { computeOverallScore } from "@/lib/scoring/dimensions";

export interface WeeklyAction {
  dimension: string;
  title: string;
  detail: string;
  dueBy: string;
  template?: string;
}

/**
 * Recomputes a concrete next step from the same shared scoring and blocker
 * logic used by assessments. A weekly email never trusts a stale stored
 * blocker: updating brand facts through intake immediately changes the next
 * Monday's action.
 */
export function selectNextAction(
  brand: Brand,
  retailer: Retailer,
  now = new Date(),
): { action: WeeklyAction; overallScore: number } {
  const dimensions = scoreDimensionsSafe(toScoringInput(brand, retailer));
  const blocker = selectBlocker(dimensions);
  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + 7);
  const dueBy = due.toISOString().slice(0, 10);

  const action = { ...selectActionForBlocker(blocker, retailer.name), dueBy };
  return { action, overallScore: computeOverallScore(dimensions) };
}

export function selectActionForBlocker(
  blocker: BlockerResult,
  retailerName: string,
): Omit<WeeklyAction, "dueBy"> {
  switch (blocker.dimension) {
    case "margin":
      return {
        dimension: blocker.dimension,
        title: `Approve a ${retailerName} margin-ready price`,
        detail: `Your current shelf-margin gap is ${blocker.facts.marginSurplusPct.toFixed(1)} points. Model and approve a wholesale/MSRP combination that clears ${blocker.facts.requiredMarginPct}%.`,
      };
    case "distributor":
      return {
        dimension: blocker.dimension,
        title: `Start the distributor conversation for ${retailerName}`,
        detail: "Secure a distributor relationship and confirm EDI/EFT readiness.",
        template: `Subject: Distribution fit for ${retailerName}\n\nHi [Distributor contact],\n\nI lead ${"[Brand]"}, a ${"[category]"} brand preparing for ${retailerName}. We are ready to share our product details, pricing, and launch plan. Could we schedule a 20-minute intake call this week?\n\nBest,\n[Founder]`,
      };
    case "certification":
      return {
        dimension: blocker.dimension,
        title: `Close the ${blocker.facts.missingCertifications.join(", ")} certification gap`,
        detail: "Choose the certification path, request a timeline, and book the first step.",
        template: `Subject: Certification timeline request\n\nHello,\n\nWe are preparing our ${"[category]"} brand for ${retailerName} and need ${blocker.facts.missingCertifications.join(", ")}. Please send the next available onboarding steps, required documents, and timeline.\n\nThank you,\n[Founder]`,
      };
    case "timing":
      return {
        dimension: blocker.dimension,
        title: `Prepare the ${retailerName} submission package`,
        detail: blocker.facts.submissionWindowOpen
          ? "The submission window is open. Finalize and submit your package."
          : `The next submission window is ${blocker.facts.daysUntilNextWindow ?? "not yet published"} days away. Finish your package outline.`,
      };
    case "velocity":
      return {
        dimension: blocker.dimension,
        title: "Create retail velocity proof",
        detail: "Run or document a four-week retail test and capture weekly units-per-store data.",
      };
    case "fulfillment":
      return {
        dimension: blocker.dimension,
        title: "Confirm a regional-PO fulfillment plan",
        detail: `Document a co-manufacturing, lead-time, and regional-capacity plan that can support ${retailerName}.`,
      };
  }
}
