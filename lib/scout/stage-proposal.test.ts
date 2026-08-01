import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { retailerRequirementProposal: { create: mockCreate } },
}));

import { stageProposals } from "./stage-proposal";

const PROPOSAL = {
  retailerId: "retailer-1",
  proposedRequirements: { minGrossMarginPct: 42 },
  sourceUrl: "https://www.wholefoodsmarket.com/suppliers",
  rationale: "Stored value is 40%, page states 42%.",
};

describe("stageProposals", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("stages a proposal with status defaulting via the schema, not this code", async () => {
    mockCreate.mockResolvedValue({ id: "proposal-1" });

    const result = await stageProposals([PROPOSAL]);

    expect(result).toEqual({ staged: 1, failed: [] });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        retailerId: "retailer-1",
        proposedRequirements: { minGrossMarginPct: 42 },
        sourceUrl: "https://www.wholefoodsmarket.com/suppliers",
        rationale: "Stored value is 40%, page states 42%.",
      },
    });
  });

  it("records a failure and continues when the DB write throws", async () => {
    mockCreate
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce({ id: "proposal-2" });

    const result = await stageProposals([
      PROPOSAL,
      { ...PROPOSAL, retailerId: "retailer-2" },
    ]);

    expect(result).toEqual({ staged: 1, failed: ["retailer-1"] });
  });
});
