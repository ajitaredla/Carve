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
): GenerationLogStatusRow {
  return { createdAt: new Date(createdAt), output, verificationResult };
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
});
