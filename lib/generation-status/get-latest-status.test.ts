import { describe, expect, it, vi } from "vitest";
import {
  getLatestGenerationStatus,
  type GenerationLogReader,
  type GenerationLogStatusRow,
} from "./get-latest-status";

function mockDb(rows: GenerationLogStatusRow[]): GenerationLogReader {
  return {
    generationLog: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  };
}

function row(
  createdAt: string,
  output: string,
  verificationResult: string,
  extra?: { checkerKind?: "fact" | "completeness"; attempt?: number },
): GenerationLogStatusRow {
  return {
    createdAt: new Date(createdAt),
    output,
    verificationResult,
    checkerKind: extra?.checkerKind ?? null,
    attempt: extra?.attempt ?? null,
  };
}

const T0 = "2026-07-25T00:00:00.000Z";
const T1 = "2026-07-25T00:05:00.000Z";

describe("getLatestGenerationStatus", () => {
  it("returns not_started when no GenerationLog rows exist", async () => {
    const db = mockDb([]);

    const result = await getLatestGenerationStatus(db, {
      surface: "blocker_statement",
      assessmentId: "assess_1",
    });

    expect(result).toEqual({ status: "not_started" });
  });

  it("returns pass with the generated text for a clean first-try PASS run (2 rows)", async () => {
    // generate.ts's PASS-first-try mapping: [generator: pass, verifier: pass].
    // All rows from one persistGenerationLogs batch share createdAt (see
    // this module's header on Postgres transaction-frozen `now()`).
    const db = mockDb([
      row(T0, "Your $4.50 wholesale gives Sprouts 55% margin.", "pass"),
      row(T0, "PASS", "pass"),
    ]);

    const result = await getLatestGenerationStatus(db, {
      surface: "blocker_statement",
      assessmentId: "assess_1",
    });

    expect(result).toEqual({
      status: "pass",
      output: "Your $4.50 wholesale gives Sprouts 55% margin.",
    });
  });

  it("returns pass with the CORRECTED text for a flagged-then-passed run (4 rows)", async () => {
    // generate.ts's flagged-then-PASS mapping: [generator: regenerated,
    // verifier: flagged, follow-up: pass, verifier: pass].
    const db = mockDb([
      row(T0, "first draft with a wrong margin figure", "regenerated"),
      row(T0, "FLAGGED: margin figure does not match retailer requirements", "flagged"),
      row(T0, "corrected draft with the right margin figure", "pass"),
      row(T0, "PASS", "pass"),
    ]);

    const result = await getLatestGenerationStatus(db, {
      surface: "waterfall_verdict",
      costWaterfallId: "cw_1",
    });

    expect(result).toEqual({
      status: "pass",
      output: "corrected draft with the right margin figure",
    });
  });

  it("returns needs_review with the discrepancy for a flagged-twice run (4 rows), never falling back to a stale value", async () => {
    // generate.ts's flagged-twice mapping: [generator: regenerated,
    // verifier: flagged, follow-up: failed, verifier: flagged].
    const db = mockDb([
      row(T0, "first draft with a wrong margin figure", "regenerated"),
      row(T0, "FLAGGED: margin figure does not match retailer requirements", "flagged"),
      row(T0, "still-wrong corrected draft", "failed"),
      row(T0, "FLAGGED: still cites the wrong margin figure after correction", "flagged"),
    ]);

    const result = await getLatestGenerationStatus(db, {
      surface: "blocker_statement",
      assessmentId: "assess_1",
    });

    expect(result.status).toBe("needs_review");
    if (result.status === "needs_review") {
      // Never the literal "not_started"/stale-value fallback — a real
      // discrepancy string from the log.
      expect(result.discrepancy.length).toBeGreaterThan(0);
      expect(result.discrepancy).not.toContain("FLAGGED:");
    }
  });

  it("only considers the MOST RECENT run, ignoring an older run with a different outcome", async () => {
    // An older failed (needs_review) run at T0, then a later successful
    // run at T1 (e.g. the founder retried in a completely separate request).
    // The helper must report the LATER run's outcome, not the earlier one.
    const db = mockDb([
      row(T1, "Second attempt, now correct.", "pass"),
      row(T1, "PASS", "pass"),
      row(T0, "first draft with a wrong margin figure", "regenerated"),
      row(T0, "FLAGGED: wrong margin figure", "flagged"),
      row(T0, "still-wrong corrected draft", "failed"),
      row(T0, "FLAGGED: still wrong", "flagged"),
    ]);

    const result = await getLatestGenerationStatus(db, {
      surface: "blocker_statement",
      assessmentId: "assess_1",
    });

    expect(result).toEqual({ status: "pass", output: "Second attempt, now correct." });
  });

  it("returns failed for an anomalous batch shape (no content-pass row, no flagged-verifier row)", async () => {
    const db = mockDb([row(T0, "some unexpected row shape", "regenerated")]);

    const result = await getLatestGenerationStatus(db, {
      surface: "blocker_statement",
      assessmentId: "assess_1",
    });

    expect(result).toEqual({ status: "failed" });
  });

  it("throws when neither assessmentId nor costWaterfallId is given", async () => {
    const db = mockDb([]);

    await expect(
      getLatestGenerationStatus(db, { surface: "blocker_statement" }),
    ).rejects.toThrow(/requires either/);
  });

  it("throws when BOTH assessmentId and costWaterfallId are given", async () => {
    const db = mockDb([]);

    await expect(
      getLatestGenerationStatus(db, {
        surface: "waterfall_verdict",
        assessmentId: "assess_1",
        costWaterfallId: "cw_1",
      }),
    ).rejects.toThrow(/only ONE/);
  });

  it("queries generationLog.findMany with the surface + assessmentId filter (not costWaterfallId) when assessmentId is given", async () => {
    const db = mockDb([]);

    await getLatestGenerationStatus(db, {
      surface: "sell_sheet_outline",
      assessmentId: "assess_42",
    });

    expect(db.generationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { surface: "sell_sheet_outline", assessmentId: "assess_42" },
      }),
    );
  });

  it("queries generationLog.findMany with the surface + costWaterfallId filter when costWaterfallId is given", async () => {
    const db = mockDb([]);

    await getLatestGenerationStatus(db, {
      surface: "waterfall_verdict",
      costWaterfallId: "cw_42",
    });

    expect(db.generationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { surface: "waterfall_verdict", costWaterfallId: "cw_42" },
      }),
    );
  });

  describe("document surfaces (lib/agents/document-graph.ts's multi-checker graph)", () => {
    it("returns pass with the final generator text when both checkers pass on attempt 1", async () => {
      const db = mockDb([
        row(T0, "complete, accurate KeHE application", "pass"),
        row(T0, "PASS", "pass", { checkerKind: "fact", attempt: 1 }),
        row(T0, "PASS", "pass", { checkerKind: "completeness", attempt: 1 }),
      ]);

      const result = await getLatestGenerationStatus(db, {
        surface: "kehe_application",
        assessmentId: "assess_1",
      });

      expect(result).toEqual({
        status: "pass",
        output: "complete, accurate KeHE application",
      });
    });

    it("returns pass with the CORRECTED text when a checker flags attempt 1 but both pass attempt 2", async () => {
      const db = mockDb([
        row(T0, "draft missing a subject line", "regenerated"),
        row(T0, "FLAGGED: missing a subject line", "flagged", {
          checkerKind: "completeness",
          attempt: 1,
        }),
        row(T0, "PASS", "pass", { checkerKind: "fact", attempt: 1 }),
        row(T0, "corrected draft with a subject line", "pass"),
        row(T0, "PASS", "pass", { checkerKind: "fact", attempt: 2 }),
        row(T0, "PASS", "pass", { checkerKind: "completeness", attempt: 2 }),
      ]);

      const result = await getLatestGenerationStatus(db, {
        surface: "kehe_application",
        assessmentId: "assess_1",
      });

      expect(result).toEqual({
        status: "pass",
        output: "corrected draft with a subject line",
      });
    });

    it("resolves the ASYMMETRIC case correctly: fact-check flags attempt 1, completeness flags attempt 2 — must surface the attempt-2 message, not the resolved attempt-1 one", async () => {
      // This is exactly the bug lib/generation-status/get-latest-status.ts's
      // document-surface resolution path was added to fix: naively picking
      // "the last flagged row" from the whole batch (as the 2-node
      // resolveOutcomeFromBatch correctly does for its own single-checker
      // case) would risk surfacing an ALREADY-RESOLVED attempt-1 fact-check
      // message while burying the CURRENT attempt-2 completeness message —
      // the actual reason the founder is looking at needs_review.
      const db = mockDb([
        row(T0, "draft with a wrong margin figure", "regenerated"),
        row(T0, "FLAGGED: margin figure does not match retailer requirements", "flagged", {
          checkerKind: "fact",
          attempt: 1,
        }),
        row(T0, "PASS", "pass", { checkerKind: "completeness", attempt: 1 }),
        row(T0, "corrected margin, but now missing a subject line", "failed"),
        row(T0, "PASS", "pass", { checkerKind: "fact", attempt: 2 }),
        row(T0, "FLAGGED: missing a subject line", "flagged", {
          checkerKind: "completeness",
          attempt: 2,
        }),
      ]);

      const result = await getLatestGenerationStatus(db, {
        surface: "kehe_application",
        assessmentId: "assess_1",
      });

      expect(result.status).toBe("needs_review");
      if (result.status === "needs_review") {
        expect(result.discrepancy).toContain("missing a subject line");
        expect(result.discrepancy).not.toContain("margin figure");
      }
    });

    it("joins BOTH messages when both checkers flag on the same (latest) attempt", async () => {
      const db = mockDb([
        row(T0, "draft with a wrong margin figure and no subject line", "failed"),
        row(T0, "FLAGGED: margin figure does not match retailer requirements", "flagged", {
          checkerKind: "fact",
          attempt: 2,
        }),
        row(T0, "FLAGGED: missing a subject line", "flagged", {
          checkerKind: "completeness",
          attempt: 2,
        }),
      ]);

      const result = await getLatestGenerationStatus(db, {
        surface: "kehe_application",
        assessmentId: "assess_1",
      });

      expect(result.status).toBe("needs_review");
      if (result.status === "needs_review") {
        expect(result.discrepancy).toContain("margin figure");
        expect(result.discrepancy).toContain("subject line");
      }
    });
  });
});
