import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock every collaborator: the auth boundary, Prisma, the shared Assessment-
// scores upsert helper, and the generation state machine. This test verifies
// actions/assessment.ts's OWN wiring/data-flow (ownership check happens,
// scoring happens before generation, blockerStatement is only written on
// `final`, GenerationLog rows are always persisted) — not the scoring engine
// or the state machine themselves, which have their own test suites.
//
// All mock functions are declared via `vi.hoisted()` — actions/assessment.ts
// imports every one of these modules EAGERLY at the top of the file, so each
// `vi.mock` factory below runs as soon as that import is evaluated (before a
// plain top-level `const mockX = vi.fn()` would have run), which hits a TDZ
// ReferenceError without `vi.hoisted()`. See lib/agents/generate.test.ts for
// the same note in more detail.
// ---------------------------------------------------------------------------

const { mockRequireCurrentBrand } = vi.hoisted(() => ({
  mockRequireCurrentBrand: vi.fn(),
}));
vi.mock("@/lib/auth/current-brand", () => ({
  requireCurrentBrand: mockRequireCurrentBrand,
}));

const { mockRetailerFindUnique, mockAssessmentUpdate, mockTransaction } =
  vi.hoisted(() => ({
    mockRetailerFindUnique: vi.fn(),
    mockAssessmentUpdate: vi.fn(),
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

const { mockGenerateWithVerification, mockPersistGenerationLogs } =
  vi.hoisted(() => ({
    mockGenerateWithVerification: vi.fn(),
    mockPersistGenerationLogs: vi.fn(),
  }));
vi.mock("@/lib/agents/generate", async (importOriginal) => {
  // `wrapUntrustedField` is passed through from the real module (via
  // vitest's `importOriginal`) rather than re-implemented here — it's pure
  // string formatting (no I/O, no session calls) added by 6.7a's security
  // review (prompt-injection hardening for founder-supplied fields like
  // Brand.name embedded in kickoff prompts). A bare `vi.fn()` stub would
  // hide whether assessment.ts actually calls it on the right field, and a
  // hand-copied reimplementation here would silently drift from the real
  // one — importOriginal avoids both.
  const actual =
    await importOriginal<typeof import("@/lib/agents/generate")>();
  return {
    generateWithVerification: mockGenerateWithVerification,
    persistGenerationLogs: mockPersistGenerationLogs,
    wrapUntrustedField: actual.wrapUntrustedField,
  };
});

import { generateBlockerStatement } from "./assessment";

const BRAND = {
  id: "brand-1",
  name: "Test Brand",
  category: "snacks",
};

const RETAILER = {
  id: "retailer-1",
  slug: "sprouts",
  name: "Sprouts Farmers Market",
};

const ASSESSMENT = {
  id: "assessment-1",
  retailerDataVersion: "2026-01-15T00:00:00.000Z",
  blockerStatement: "",
};

const BLOCKER = {
  dimension: "fulfillment" as const,
  score: 20,
  weight: 9,
  reason: "90-day lead time.",
  facts: { hasCoManufacturer: false, leadTimeDays: 90 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCurrentBrand.mockResolvedValue(BRAND);
  mockRetailerFindUnique.mockResolvedValue(RETAILER);

  // Every action wraps calls in prisma.$transaction — run the callback
  // against a fake tx exposing just what's needed.
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ assessment: { update: mockAssessmentUpdate } }),
  );

  mockUpsertAssessmentScores.mockResolvedValue({
    assessment: ASSESSMENT,
    blocker: BLOCKER,
    overallScore: 62,
    dimensions: {},
  });

  mockPersistGenerationLogs.mockResolvedValue([{ id: "log-1" }]);

  // Default happy-path result — individual tests override this when the
  // generation outcome itself is what's under test.
  mockGenerateWithVerification.mockResolvedValue({
    status: "final",
    text: "Default blocker statement.",
    logEntries: [],
    canonicalLogEntryIndex: 0,
  });
});

describe("generateBlockerStatement", () => {
  it("checks brand ownership before anything else", async () => {
    await generateBlockerStatement("sprouts");
    expect(mockRequireCurrentBrand).toHaveBeenCalled();
  });

  it("throws if the retailer slug doesn't exist", async () => {
    mockRetailerFindUnique.mockResolvedValue(null);
    await expect(generateBlockerStatement("nonexistent")).rejects.toThrow(
      /no retailer found/i,
    );
  });

  it("scores BEFORE calling generateWithVerification (Assessment must exist for the verifier's tool call)", async () => {
    const callOrder: string[] = [];
    mockUpsertAssessmentScores.mockImplementation(async () => {
      callOrder.push("score");
      return {
        assessment: ASSESSMENT,
        blocker: BLOCKER,
        overallScore: 62,
        dimensions: {},
      };
    });
    mockGenerateWithVerification.mockImplementation(async () => {
      callOrder.push("generate");
      return { status: "final", text: "Blocker text.", logEntries: [] };
    });

    await generateBlockerStatement("sprouts");
    expect(callOrder).toEqual(["score", "generate"]);
  });

  it("on final: writes blockerStatement and persists GenerationLog rows linked to the assessment", async () => {
    mockGenerateWithVerification.mockResolvedValue({
      status: "final",
      text: "Your $4.50 wholesale clears margin; the real blocker is your co-manufacturer relationship.",
      logEntries: [{ output: "entry" }],
      canonicalLogEntryIndex: 0,
    });

    const result = await generateBlockerStatement("sprouts");

    expect(result).toEqual({
      status: "final",
      assessmentId: "assessment-1",
      blockerDimension: "fulfillment",
      blockerStatement:
        "Your $4.50 wholesale clears margin; the real blocker is your co-manufacturer relationship.",
      overallScore: 62,
    });

    expect(mockPersistGenerationLogs).toHaveBeenCalledWith(
      expect.anything(),
      [{ output: "entry" }],
      { assessmentId: "assessment-1" },
    );
    expect(mockAssessmentUpdate).toHaveBeenCalledWith({
      where: { id: "assessment-1" },
      data: {
        blockerStatement:
          "Your $4.50 wholesale clears margin; the real blocker is your co-manufacturer relationship.",
      },
    });
  });

  it("on needs_review: does NOT write blockerStatement, but still persists GenerationLog rows", async () => {
    mockGenerateWithVerification.mockResolvedValue({
      status: "needs_review",
      lastDiscrepancy: "still cites the wrong margin figure.",
      logEntries: [{ output: "entry-1" }, { output: "entry-2" }],
    });

    const result = await generateBlockerStatement("sprouts");

    expect(result).toEqual({
      status: "needs_review",
      assessmentId: "assessment-1",
      blockerDimension: "fulfillment",
      discrepancy: "still cites the wrong margin figure.",
    });

    expect(mockPersistGenerationLogs).toHaveBeenCalledWith(
      expect.anything(),
      [{ output: "entry-1" }, { output: "entry-2" }],
      { assessmentId: "assessment-1" },
    );
    expect(mockAssessmentUpdate).not.toHaveBeenCalled();
  });

  it("passes the assessment id and brand id into the verify prompt closure", async () => {
    mockGenerateWithVerification.mockResolvedValue({
      status: "final",
      text: "Blocker text.",
      logEntries: [],
      canonicalLogEntryIndex: 0,
    });

    await generateBlockerStatement("sprouts");

    const [, verifyPromptFn] = mockGenerateWithVerification.mock.calls[0];
    const verifyPrompt = verifyPromptFn("Some generated text.") as string;
    expect(verifyPrompt).toContain("assessment-1");
    expect(verifyPrompt).toContain("brand-1");
    expect(verifyPrompt).toContain("Some generated text.");
  });
});
