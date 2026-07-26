import { describe, expect, it } from "vitest";

import type { BlockerResult } from "@/lib/scoring/blocker";
import { selectActionForBlocker } from "./select";

const blockers: BlockerResult[] = [
  { dimension: "margin", score: 0, weight: 27, reason: "", facts: { wholesalePrice: 5, retailPrice: 6, actualMarginPct: 16, requiredMarginPct: 40, marginSurplusPct: -24 } },
  { dimension: "distributor", score: 0, weight: 23, reason: "", facts: { hasKeheRelationship: false, hasUnfiRelationship: false, ediCapable: false, eftCapable: false, hasDistributorRelationship: false } },
  { dimension: "certification", score: 0, weight: 18, reason: "", facts: { requiredCertifications: ["sqf"], heldCertifications: [], missingCertifications: ["sqf"] } },
  { dimension: "timing", score: 0, weight: 13, reason: "", facts: { submissionWindowOpen: false, daysUntilNextWindow: 30 } },
  { dimension: "velocity", score: 0, weight: 10, reason: "", facts: { isDtcOnly: true, unitsPerStorePerWeek: 0 } },
  { dimension: "fulfillment", score: 0, weight: 9, reason: "", facts: { hasCoManufacturer: false, leadTimeDays: 60, hasRegionalProductionCapacity: false, meetsLeadTimeRequirement: false } },
];

describe("selectActionForBlocker", () => {
  it.each(blockers)("creates a distinct concrete action for $dimension", (blocker) => {
    const action = selectActionForBlocker(blocker, "Carve Market");

    expect(action.dimension).toBe(blocker.dimension);
    expect(action.title).not.toHaveLength(0);
    expect(action.detail).not.toHaveLength(0);
  });

  it("includes a usable draft where outreach is relevant", () => {
    expect(selectActionForBlocker(blockers[1], "Carve Market").template).toContain("Subject:");
    expect(selectActionForBlocker(blockers[2], "Carve Market").template).toContain("Subject:");
  });
});
