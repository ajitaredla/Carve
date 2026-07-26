import { describe, expect, it, vi } from "vitest";
import { Prisma, type Retailer } from "@prisma/client";
import {
  BLOCKER_STATEMENT_PENDING,
  upsertAssessmentScores,
} from "./persist";
import type { BrandScoringFacts } from "@/lib/scoring/map-retailer-requirements";

const { Decimal } = Prisma;

function makeRetailer(overrides: Partial<Retailer> = {}): Retailer {
  return {
    id: "retailer-1",
    slug: "sprouts",
    name: "Sprouts Farmers Market",
    requirements: {
      minGrossMarginPct: 40,
      requiredCertifications: ["usda_organic"],
      submissionWindow: { open: true, daysUntilNextWindow: null },
    },
    updatedAt: new Date("2026-01-15T00:00:00.000Z"),
    ...overrides,
  };
}

function makeBrand(
  overrides: Partial<BrandScoringFacts> = {},
): BrandScoringFacts {
  return {
    id: "brand-1",
    name: "Test Brand",
    category: "snacks",
    wholesalePrice: new Decimal(4.5),
    retailPrice: new Decimal(10),
    hasKeheRelationship: true,
    hasUnfiRelationship: false,
    ediCapable: true,
    eftCapable: true,
    heldCertifications: ["usda_organic"],
    isDtcOnly: false,
    unitsPerStorePerWeek: new Decimal(5),
    hasCoManufacturer: true,
    leadTimeDays: 20,
    hasRegionalProductionCapacity: true,
    ...overrides,
  };
}

function makeDb() {
  return {
    assessment: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

describe("upsertAssessmentScores", () => {
  it("creates a new Assessment with the pending blockerStatement sentinel when none exists", async () => {
    const db = makeDb();
    db.assessment.findUnique.mockResolvedValue(null);
    db.assessment.upsert.mockImplementation(
      async ({ create }: { create: unknown }) => ({
        id: "assessment-1",
        ...(create as object),
      }),
    );

    const brand = makeBrand();
    const retailer = makeRetailer();

    const result = await upsertAssessmentScores(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      brand,
      retailer,
    );

    expect(result.created).toBe(true);
    expect(db.assessment.findUnique).toHaveBeenCalledWith({
      where: {
        brandId_retailerId: { brandId: "brand-1", retailerId: "retailer-1" },
      },
    });
    expect(db.assessment.upsert).toHaveBeenCalledWith({
      where: {
        brandId_retailerId: { brandId: "brand-1", retailerId: "retailer-1" },
      },
      update: expect.not.objectContaining({ blockerStatement: expect.anything() }),
      create: expect.objectContaining({
        brandId: "brand-1",
        retailerId: "retailer-1",
        blockerStatement: BLOCKER_STATEMENT_PENDING,
        retailerDataVersion: "2026-01-15T00:00:00.000Z",
      }),
    });
    expect(result.assessment.blockerStatement).toBe("");
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.blocker.dimension).toBeDefined();
  });

  it("updates scores on an existing Assessment without touching blockerStatement", async () => {
    const db = makeDb();
    db.assessment.findUnique.mockResolvedValue({
      id: "assessment-1",
      blockerStatement: "A real, previously-generated blocker statement.",
    });
    db.assessment.upsert.mockImplementation(async () => ({
      id: "assessment-1",
      blockerStatement: "A real, previously-generated blocker statement.",
    }));

    const brand = makeBrand();
    const retailer = makeRetailer();

    const result = await upsertAssessmentScores(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      brand,
      retailer,
    );

    expect(result.created).toBe(false);
    expect(db.assessment.upsert).toHaveBeenCalledWith({
      where: {
        brandId_retailerId: { brandId: "brand-1", retailerId: "retailer-1" },
      },
      update: expect.not.objectContaining({ blockerStatement: expect.anything() }),
      create: expect.objectContaining({ brandId: "brand-1", retailerId: "retailer-1" }),
    });
    expect(result.assessment.blockerStatement).toBe(
      "A real, previously-generated blocker statement.",
    );
  });

  it("stamps retailerDataVersion from retailer.updatedAt", async () => {
    const db = makeDb();
    db.assessment.findUnique.mockResolvedValue(null);
    db.assessment.upsert.mockImplementation(
      async ({ create }: { create: unknown }) => create,
    );

    const retailer = makeRetailer({
      updatedAt: new Date("2026-03-01T12:00:00.000Z"),
    });

    const result = await upsertAssessmentScores(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      makeBrand(),
      retailer,
    );

    expect(result.assessment).toMatchObject({
      retailerDataVersion: "2026-03-01T12:00:00.000Z",
    });
  });

  it("propagates ScoringInputMappingError from invalid retailer requirements without writing anything", async () => {
    const db = makeDb();
    db.assessment.findUnique.mockResolvedValue(null);

    const retailer = makeRetailer({ requirements: "not-an-object" });

    await expect(
      upsertAssessmentScores(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db as any,
        makeBrand(),
        retailer,
      ),
    ).rejects.toThrow();

    expect(db.assessment.upsert).not.toHaveBeenCalled();
  });
});
