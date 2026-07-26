import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock functions are declared via `vi.hoisted()` because actions/outcomes.ts
// imports every one of these modules eagerly at the top of the file — see
// lib/agents/generate.test.ts's note for the full TDZ explanation.

const { mockRequireCurrentBrand } = vi.hoisted(() => ({
  mockRequireCurrentBrand: vi.fn(),
}));
vi.mock("@/lib/auth/current-brand", () => ({
  requireCurrentBrand: mockRequireCurrentBrand,
}));

const { mockRetailerFindUnique, mockAssessmentFindUnique, mockOutcomeCreate } =
  vi.hoisted(() => ({
    mockRetailerFindUnique: vi.fn(),
    mockAssessmentFindUnique: vi.fn(),
    mockOutcomeCreate: vi.fn(),
  }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    retailer: { findUnique: mockRetailerFindUnique },
    assessment: { findUnique: mockAssessmentFindUnique },
    outcome: { create: mockOutcomeCreate },
  },
}));

import { logOutcome } from "./outcomes";

const BRAND = { id: "brand-1", name: "Test Brand" };
const RETAILER = { id: "retailer-1", slug: "sprouts", name: "Sprouts" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCurrentBrand.mockResolvedValue(BRAND);
  mockRetailerFindUnique.mockResolvedValue(RETAILER);
  mockOutcomeCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "outcome-1",
    loggedAt: new Date("2026-07-25T00:00:00.000Z"),
    ...data,
  }));
});

describe("logOutcome", () => {
  it("rejects an invalid status before touching the database", async () => {
    await expect(
      logOutcome({
        retailerId: "retailer-1",
        // @ts-expect-error — deliberately invalid for this test.
        status: "maybe",
      }),
    ).rejects.toThrow(/invalid outcome status/i);

    expect(mockRequireCurrentBrand).not.toHaveBeenCalled();
  });

  it("checks brand ownership via requireCurrentBrand", async () => {
    await logOutcome({ retailerId: "retailer-1", status: "won" });
    expect(mockRequireCurrentBrand).toHaveBeenCalled();
  });

  it("throws if the retailer doesn't exist", async () => {
    mockRetailerFindUnique.mockResolvedValue(null);
    await expect(
      logOutcome({ retailerId: "nonexistent", status: "won" }),
    ).rejects.toThrow(/no retailer found/i);
  });

  it("creates an Outcome row scoped to the current brand, unlinked when no assessment exists for this brand+retailer", async () => {
    mockAssessmentFindUnique.mockResolvedValue(null);

    const result = await logOutcome({
      retailerId: "retailer-1",
      status: "won",
      notes: "Got the PO after resubmitting the checklist.",
    });

    expect(mockOutcomeCreate).toHaveBeenCalledWith({
      data: {
        brandId: "brand-1",
        retailerId: "retailer-1",
        assessmentId: null,
        status: "won",
        notes: "Got the PO after resubmitting the checklist.",
      },
    });
    expect(result.id).toBe("outcome-1");
    expect(result.status).toBe("won");
  });

  it("auto-resolves assessmentId from the brand+retailer pair when not explicitly supplied (per 6.8's product review)", async () => {
    mockAssessmentFindUnique.mockResolvedValue({
      id: "assessment-current",
      brandId: "brand-1",
    });

    await logOutcome({ retailerId: "retailer-1", status: "won" });

    expect(mockAssessmentFindUnique).toHaveBeenCalledWith({
      where: {
        brandId_retailerId: { brandId: "brand-1", retailerId: "retailer-1" },
      },
    });
    expect(mockOutcomeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ assessmentId: "assessment-current" }),
    });
  });

  it("rejects an assessmentId that exists but belongs to a different brand", async () => {
    mockAssessmentFindUnique.mockResolvedValue({
      id: "assessment-1",
      brandId: "some-other-brand",
    });

    await expect(
      logOutcome({
        retailerId: "retailer-1",
        status: "pending",
        assessmentId: "assessment-1",
      }),
    ).rejects.toThrow(/does not belong to the current brand/i);

    expect(mockOutcomeCreate).not.toHaveBeenCalled();
  });

  it("rejects an assessmentId that doesn't exist at all", async () => {
    mockAssessmentFindUnique.mockResolvedValue(null);

    await expect(
      logOutcome({
        retailerId: "retailer-1",
        status: "pending",
        assessmentId: "nonexistent",
      }),
    ).rejects.toThrow(/no assessment found/i);
  });

  it("links a valid, brand-owned assessmentId", async () => {
    mockAssessmentFindUnique.mockResolvedValue({
      id: "assessment-1",
      brandId: "brand-1",
    });

    await logOutcome({
      retailerId: "retailer-1",
      status: "rejected",
      assessmentId: "assessment-1",
    });

    expect(mockOutcomeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assessmentId: "assessment-1",
        status: "rejected",
      }),
    });
  });
});
