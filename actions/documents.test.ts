import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSessionError } from "@/lib/agents/session";

// Mock functions are declared via `vi.hoisted()` because actions/documents.ts
// imports every one of these modules eagerly at the top of the file — see
// lib/agents/generate.test.ts's note for the full TDZ explanation.

const { mockRequireCurrentBrand } = vi.hoisted(() => ({
  mockRequireCurrentBrand: vi.fn(),
}));
vi.mock("@/lib/auth/current-brand", () => ({
  requireCurrentBrand: mockRequireCurrentBrand,
}));

const { mockAssessmentFindUnique, mockGeneratedDocumentCreate, mockTransaction } =
  vi.hoisted(() => ({
    mockAssessmentFindUnique: vi.fn(),
    mockGeneratedDocumentCreate: vi.fn(),
    mockTransaction: vi.fn(),
  }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    assessment: { findUnique: mockAssessmentFindUnique },
    $transaction: mockTransaction,
  },
}));

const { mockPersistGenerationLogs } = vi.hoisted(() => ({
  mockPersistGenerationLogs: vi.fn(),
}));
vi.mock("@/lib/agents/generate", async (importOriginal) => {
  // wrapUntrustedField is passed through real (via importOriginal), not
  // mocked — see actions/assessment.test.ts's identical note for why.
  const actual =
    await importOriginal<typeof import("@/lib/agents/generate")>();
  return {
    persistGenerationLogs: mockPersistGenerationLogs,
    wrapUntrustedField: actual.wrapUntrustedField,
  };
});

// documents.ts now calls generateDocumentWithChecks (the multi-checker
// document graph, lib/agents/document-graph.ts) instead of generate.ts's
// generateWithVerification — this is the one thing that actually changed
// about this file. Everything below still refers to the mock as
// `mockGenerateWithVerification` purely to keep the rest of this test file's
// diff minimal; it now stands in for `generateDocumentWithChecks`.
const { mockGenerateWithVerification } = vi.hoisted(() => ({
  mockGenerateWithVerification: vi.fn(),
}));
vi.mock("@/lib/agents/document-graph", () => ({
  generateDocumentWithChecks: mockGenerateWithVerification,
}));

import { generateAllDocuments, generateKeheApplication } from "./documents";
import { DOCUMENT_TYPES } from "@/lib/documents/types";

const BRAND = { id: "brand-1", name: "Test Brand", category: "snacks" };
const RETAILER = { id: "retailer-1", slug: "sprouts", name: "Sprouts" };
const ASSESSMENT = {
  id: "assessment-1",
  brandId: "brand-1",
  overallScore: 65,
  blockerDimension: "fulfillment",
  blockerStatement: "90-day lead time is the real blocker.",
  retailerDataVersion: "2026-01-15T00:00:00.000Z",
  retailer: RETAILER,
  costWaterfall: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCurrentBrand.mockResolvedValue(BRAND);
  mockAssessmentFindUnique.mockResolvedValue(ASSESSMENT);

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ generatedDocument: { create: mockGeneratedDocumentCreate } }),
  );

  mockPersistGenerationLogs.mockResolvedValue([{ id: "log-1" }]);
  mockGeneratedDocumentCreate.mockResolvedValue({ id: "doc-1" });
});

describe("generateKeheApplication (single document)", () => {
  it("checks ownership: throws if the assessment does not belong to the current brand", async () => {
    mockAssessmentFindUnique.mockResolvedValue({
      ...ASSESSMENT,
      brandId: "some-other-brand",
    });

    await expect(generateKeheApplication("assessment-1")).rejects.toThrow(
      /does not belong to the current brand/i,
    );
  });

  it("throws if the assessment doesn't exist", async () => {
    mockAssessmentFindUnique.mockResolvedValue(null);
    await expect(generateKeheApplication("nonexistent")).rejects.toThrow(
      /no assessment found/i,
    );
  });

  it("on final: creates a GeneratedDocument linked to the canonical GenerationLog row", async () => {
    mockGenerateWithVerification.mockResolvedValue({
      status: "final",
      text: "Subject: Introducing Test Brand to KeHE...",
      logEntries: [{ output: "a" }, { output: "b" }, { output: "c" }],
      canonicalLogEntryIndex: 2,
    });
    mockPersistGenerationLogs.mockResolvedValue([
      { id: "log-a" },
      { id: "log-b" },
      { id: "log-c" },
    ]);

    const result = await generateKeheApplication("assessment-1");

    expect(result).toEqual({
      status: "final",
      documentType: "kehe_application",
      documentId: "doc-1",
      content: "Subject: Introducing Test Brand to KeHE...",
    });

    expect(mockGeneratedDocumentCreate).toHaveBeenCalledWith({
      data: {
        assessmentId: "assessment-1",
        documentType: "kehe_application",
        content: "Subject: Introducing Test Brand to KeHE...",
        generationLogId: "log-c", // canonicalLogEntryIndex 2
      },
    });
  });

  it("on needs_review: does not create a GeneratedDocument row, but still persists logs", async () => {
    mockGenerateWithVerification.mockResolvedValue({
      status: "needs_review",
      discrepancy: "cites a wrong retailer program name.",
      discrepancies: { fact: "cites a wrong retailer program name." },
      logEntries: [{ output: "a" }],
    });

    const result = await generateKeheApplication("assessment-1");

    expect(result).toEqual({
      status: "needs_review",
      documentType: "kehe_application",
      discrepancy: "cites a wrong retailer program name.",
      discrepancies: { fact: "cites a wrong retailer program name." },
    });
    expect(mockGeneratedDocumentCreate).not.toHaveBeenCalled();
    expect(mockPersistGenerationLogs).toHaveBeenCalled();
  });

  it("on an unexpected thrown error: resolves with status 'error' instead of rejecting", async () => {
    mockGenerateWithVerification.mockRejectedValue(
      new Error("session terminated unexpectedly"),
    );

    const result = await generateKeheApplication("assessment-1");

    expect(result.status).toBe("error");
    expect(result).toMatchObject({ documentType: "kehe_application" });
  });

  it("7.4a: triages a raw internal error into a sanitized, founder-safe message (does not leak the original text) and logs server-side", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGenerateWithVerification.mockRejectedValue(
      new Error(
        "CARVE_GENERATOR_AGENT_ID is not set. Copy .env.example to .env and fill in...",
      ),
    );

    const result = await generateKeheApplication("assessment-1");

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).not.toContain("CARVE_GENERATOR_AGENT_ID");
      expect(result.message).not.toContain(".env.example");
    }
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("7.4a: an AgentSessionError gets a short, friendly, actionable message instead of the raw session error text", async () => {
    mockGenerateWithVerification.mockRejectedValue(
      new AgentSessionError(
        "Session sesn_abc123 exhausted its retry budget before this turn completed.",
        "sesn_abc123",
      ),
    );

    const result = await generateKeheApplication("assessment-1");

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).not.toContain("sesn_abc123");
      expect(result.message.toLowerCase()).toContain("try again");
    }
  });
});

describe("generateAllDocuments — 6.1c concurrency", () => {
  it("generates all six document types and never rejects even if some fail", async () => {
    // 7.4a's sanitized-fallback branch logs server-side via console.error —
    // spy + restore so this test's expected failure path doesn't print noise.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGenerateWithVerification.mockImplementation(
      async (kickoffPrompt: string) => {
        if (kickoffPrompt.includes("UNFI")) {
          throw new Error("simulated failure for unfi_application");
        }
        if (kickoffPrompt.includes("cold outreach")) {
          return {
            status: "needs_review",
            discrepancy: "flagged discrepancy",
            discrepancies: { fact: "flagged discrepancy" },
            logEntries: [{ output: "x" }],
          };
        }
        return {
          status: "final",
          text: "generated content",
          logEntries: [{ output: "x" }],
          canonicalLogEntryIndex: 0,
        };
      },
    );
    mockPersistGenerationLogs.mockResolvedValue([{ id: "log-x" }]);

    const results = await generateAllDocuments("assessment-1");

    expect(results).toHaveLength(6);
    expect(results.map((r) => r.documentType).sort()).toEqual(
      [...DOCUMENT_TYPES].sort(),
    );

    const unfiResult = results.find((r) => r.documentType === "unfi_application");
    // 7.4a: the message is triaged (sanitized generic fallback for an
    // unrecognized error type), not the raw thrown text — see the dedicated
    // 7.4a describe block above for the full assertion of that behavior.
    expect(unfiResult?.status).toBe("error");
    if (unfiResult?.status === "error") {
      expect(unfiResult.message).not.toContain(
        "simulated failure for unfi_application",
      );
    }

    const outreachResult = results.find(
      (r) => r.documentType === "buyer_outreach_email",
    );
    expect(outreachResult?.status).toBe("needs_review");

    const others = results.filter(
      (r) =>
        r.documentType !== "unfi_application" &&
        r.documentType !== "buyer_outreach_email",
    );
    expect(others.every((r) => r.status === "final")).toBe(true);

    consoleSpy.mockRestore();
  });

  it("loads brand/assessment/retailer context only once for all six documents", async () => {
    mockGenerateWithVerification.mockResolvedValue({
      status: "final",
      text: "content",
      logEntries: [{ output: "x" }],
      canonicalLogEntryIndex: 0,
    });
    mockPersistGenerationLogs.mockResolvedValue([{ id: "log-x" }]);

    await generateAllDocuments("assessment-1");

    expect(mockAssessmentFindUnique).toHaveBeenCalledTimes(1);
    expect(mockRequireCurrentBrand).toHaveBeenCalledTimes(1);
  });
});
