import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock functions are declared via `vi.hoisted()` because actions/waterfall.ts
// imports every one of these modules eagerly at the top of the file — see
// lib/agents/generate.test.ts's note for the full TDZ explanation.

const { mockRequireCurrentBrand } = vi.hoisted(() => ({
  mockRequireCurrentBrand: vi.fn(),
}));
vi.mock("@/lib/auth/current-brand", () => ({
  requireCurrentBrand: mockRequireCurrentBrand,
}));

const {
  mockRetailerFindUnique,
  mockCostWaterfallUpsert,
  mockCostWaterfallUpdate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockRetailerFindUnique: vi.fn(),
  mockCostWaterfallUpsert: vi.fn(),
  mockCostWaterfallUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    retailer: { findUnique: mockRetailerFindUnique },
    $transaction: mockTransaction,
  },
}));

const { mockUpsertAssessmentScores } = vi.hoisted(() => ({
  mockUpsertAssessmentScores: vi.fn(),
}));
vi.mock("@/lib/assessment/persist", () => ({
  upsertAssessmentScores: mockUpsertAssessmentScores,
}));

const { mockToScoringInput } = vi.hoisted(() => ({
  mockToScoringInput: vi.fn(),
}));
vi.mock("@/lib/scoring/map-retailer-requirements", () => ({
  toScoringInput: mockToScoringInput,
}));

const { mockCalculateWaterfall } = vi.hoisted(() => ({
  mockCalculateWaterfall: vi.fn(),
}));
vi.mock("@/lib/waterfall/calculator", () => ({
  calculateWaterfall: mockCalculateWaterfall,
}));

const { mockGenerateWithVerification, mockPersistGenerationLogs } =
  vi.hoisted(() => ({
    mockGenerateWithVerification: vi.fn(),
    mockPersistGenerationLogs: vi.fn(),
  }));
vi.mock("@/lib/agents/generate", async (importOriginal) => {
  // wrapUntrustedField is passed through real (via importOriginal), not
  // mocked — see actions/assessment.test.ts's identical note for why.
  const actual =
    await importOriginal<typeof import("@/lib/agents/generate")>();
  return {
    generateWithVerification: mockGenerateWithVerification,
    persistGenerationLogs: mockPersistGenerationLogs,
    wrapUntrustedField: actual.wrapUntrustedField,
  };
});

import { generateWaterfallVerdict } from "./waterfall";
// Moved out of ./waterfall (a "use server" file, which cannot export a plain
// constant — see lib/waterfall/verdict-sentinel.ts's header for why).
import { VERDICT_STATEMENT_PENDING } from "@/lib/waterfall/verdict-sentinel";

const BRAND = { id: "brand-1", name: "Test Brand" };
const RETAILER = { id: "retailer-1", slug: "sprouts", name: "Sprouts" };
const ASSESSMENT = {
  id: "assessment-1",
  retailerDataVersion: "2026-01-15T00:00:00.000Z",
};
const COST_WATERFALL = { id: "waterfall-1" };

const WATERFALL_RESULT = {
  input: {
    factoryCost: 1,
    coPackingFee: 0.5,
    freightToDc: 0.25,
    distributorMarkupPct: 20,
    retailerMarginPct: 40,
    chargebackEstimate: 0.1,
    msrp: 5,
  },
  moneyFlow: [],
  economics: {},
  founderMarginPct: 55,
  retailerMarginPct: 40,
  investorVerdict: "pass",
};

const INPUT = {
  retailerSlug: "sprouts",
  factoryCost: 1,
  coPackingFee: 0.5,
  freightToDc: 0.25,
  distributorMarkupPct: 20,
  chargebackEstimate: 0.1,
  msrp: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCurrentBrand.mockResolvedValue(BRAND);
  mockRetailerFindUnique.mockResolvedValue(RETAILER);
  mockToScoringInput.mockReturnValue({
    margin: { retailerMinGrossMarginPct: 40 },
  });
  mockCalculateWaterfall.mockReturnValue(WATERFALL_RESULT);
  mockCostWaterfallUpsert.mockResolvedValue(COST_WATERFALL);
  mockUpsertAssessmentScores.mockResolvedValue({
    assessment: ASSESSMENT,
    blocker: {},
    overallScore: 70,
    dimensions: {},
  });

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      costWaterfall: {
        upsert: mockCostWaterfallUpsert,
        update: mockCostWaterfallUpdate,
      },
    }),
  );

  mockPersistGenerationLogs.mockResolvedValue([{ id: "log-1" }]);
});

describe("generateWaterfallVerdict", () => {
  it("checks brand ownership before anything else", async () => {
    mockGenerateWithVerification.mockResolvedValue({
      status: "final",
      text: "verdict",
      logEntries: [],
      canonicalLogEntryIndex: 0,
    });
    await generateWaterfallVerdict(INPUT);
    expect(mockRequireCurrentBrand).toHaveBeenCalled();
  });

  it("throws if the retailer slug doesn't exist", async () => {
    mockRetailerFindUnique.mockResolvedValue(null);
    await expect(generateWaterfallVerdict(INPUT)).rejects.toThrow(
      /no retailer found/i,
    );
  });

  it("derives retailerMarginPct from toScoringInput, never from the caller's input", async () => {
    mockGenerateWithVerification.mockResolvedValue({
      status: "final",
      text: "verdict",
      logEntries: [],
      canonicalLogEntryIndex: 0,
    });

    await generateWaterfallVerdict(INPUT);

    expect(mockToScoringInput).toHaveBeenCalledWith(BRAND, RETAILER);
    expect(mockCalculateWaterfall).toHaveBeenCalledWith(
      expect.objectContaining({ retailerMarginPct: 40 }),
    );
    // The caller's INPUT object has no retailerMarginPct field at all.
    expect(INPUT).not.toHaveProperty("retailerMarginPct");
  });

  it("upserts CostWaterfall with the pending sentinel on create, inside the same transaction as the Assessment upsert", async () => {
    mockGenerateWithVerification.mockResolvedValue({
      status: "final",
      text: "verdict",
      logEntries: [],
      canonicalLogEntryIndex: 0,
    });

    await generateWaterfallVerdict(INPUT);

    expect(mockCostWaterfallUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assessmentId: "assessment-1" },
        create: expect.objectContaining({
          verdictStatement: VERDICT_STATEMENT_PENDING,
          founderMarginPct: 55,
          investorVerdict: "pass",
        }),
      }),
    );
    // update payload must NOT include verdictStatement.
    const call = mockCostWaterfallUpsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty("verdictStatement");
  });

  it("rolls back the transaction (no CostWaterfall upsert attempted) when calculateWaterfall throws", async () => {
    class FakeWaterfallInputError extends Error {}
    mockCalculateWaterfall.mockImplementation(() => {
      throw new FakeWaterfallInputError("invalid input");
    });

    await expect(generateWaterfallVerdict(INPUT)).rejects.toThrow(
      "invalid input",
    );
    expect(mockCostWaterfallUpsert).not.toHaveBeenCalled();
    expect(mockGenerateWithVerification).not.toHaveBeenCalled();
  });

  it("on final: updates verdictStatement and persists logs linked to both assessmentId and costWaterfallId", async () => {
    mockGenerateWithVerification.mockResolvedValue({
      status: "final",
      text: "Founder margin of 55% clears the pass threshold comfortably.",
      logEntries: [{ output: "entry" }],
      canonicalLogEntryIndex: 0,
    });

    const result = await generateWaterfallVerdict(INPUT);

    expect(result).toEqual({
      status: "final",
      assessmentId: "assessment-1",
      costWaterfallId: "waterfall-1",
      investorVerdict: "pass",
      founderMarginPct: 55,
      verdictStatement:
        "Founder margin of 55% clears the pass threshold comfortably.",
    });

    expect(mockPersistGenerationLogs).toHaveBeenCalledWith(
      expect.anything(),
      [{ output: "entry" }],
      { assessmentId: "assessment-1", costWaterfallId: "waterfall-1" },
    );
    expect(mockCostWaterfallUpdate).toHaveBeenCalledWith({
      where: { id: "waterfall-1" },
      data: {
        verdictStatement:
          "Founder margin of 55% clears the pass threshold comfortably.",
      },
    });
  });

  it("on needs_review: does not update verdictStatement, but still persists logs", async () => {
    mockGenerateWithVerification.mockResolvedValue({
      status: "needs_review",
      lastDiscrepancy: "cites the wrong investor verdict.",
      logEntries: [{ output: "entry-1" }],
    });

    const result = await generateWaterfallVerdict(INPUT);

    expect(result).toEqual({
      status: "needs_review",
      assessmentId: "assessment-1",
      costWaterfallId: "waterfall-1",
      investorVerdict: "pass",
      founderMarginPct: 55,
      discrepancy: "cites the wrong investor verdict.",
    });

    expect(mockCostWaterfallUpdate).not.toHaveBeenCalled();
    expect(mockPersistGenerationLogs).toHaveBeenCalled();
  });
});
