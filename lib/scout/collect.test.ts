import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same @anthropic-ai/sdk mocking shape as lib/agents/session.test.ts — a
// MockAnthropic class exposing only the beta.* surfaces this file actually
// calls (deploymentRuns.list, sessions.retrieve, files.list, files.download).

const mockDeploymentRunsList = vi.fn();
const mockSessionsRetrieve = vi.fn();
const mockFilesList = vi.fn();
const mockFilesDownload = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    beta = {
      deploymentRuns: { list: mockDeploymentRunsList },
      sessions: { retrieve: mockSessionsRetrieve },
      files: { list: mockFilesList, download: mockFilesDownload },
    };
  }
  return { default: MockAnthropic };
});

import { collectWeeklyScoutResults } from "./collect";

/** Builds a mock async iterable — stands in for the real paginated
 * list-endpoint return type both deploymentRuns.list and files.list use. */
function asyncIterable<T>(items: T[]) {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next: async () =>
          index < items.length
            ? { value: items[index++], done: false as const }
            : { value: undefined, done: true as const },
      };
    },
  };
}

function jsonFile(filename: string, id: string) {
  return { id, filename };
}

describe("collectWeeklyScoutResults", () => {
  beforeEach(() => {
    vi.stubEnv("CARVE_SCOUT_DEPLOYMENT_ID", "depl_test123");
    mockDeploymentRunsList.mockReset();
    mockSessionsRetrieve.mockReset();
    mockFilesList.mockReset();
    mockFilesDownload.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when CARVE_SCOUT_DEPLOYMENT_ID is not set", async () => {
    vi.stubEnv("CARVE_SCOUT_DEPLOYMENT_ID", "");
    await expect(collectWeeklyScoutResults()).rejects.toThrow(
      /CARVE_SCOUT_DEPLOYMENT_ID/,
    );
  });

  it("returns an empty result with a warning when no successful run exists", async () => {
    mockDeploymentRunsList.mockResolvedValue(asyncIterable([]));

    const result = await collectWeeklyScoutResults();

    expect(result).toEqual({
      actions: [],
      proposals: [],
      leapAlerts: [],
      warnings: ["No successful deployment run found yet — nothing to collect."],
    });
    expect(mockSessionsRetrieve).not.toHaveBeenCalled();
  });

  it("picks the most recent run by createdAt and waits for it to be idle", async () => {
    mockDeploymentRunsList.mockResolvedValue(
      asyncIterable([
        { session_id: "sesn_older", created_at: "2026-08-01T10:00:00Z" },
        { session_id: "sesn_newer", created_at: "2026-08-01T13:05:00Z" },
      ]),
    );
    mockSessionsRetrieve.mockResolvedValue({ status: "idle" });
    mockFilesList.mockResolvedValue(asyncIterable([]));

    await collectWeeklyScoutResults();

    expect(mockSessionsRetrieve).toHaveBeenCalledWith("sesn_newer");
    expect(mockFilesList).toHaveBeenCalledWith({
      scope_id: "sesn_newer",
      betas: ["managed-agents-2026-04-01"],
    });
  });

  it("parses action/proposal/leap files into their respective arrays", async () => {
    mockDeploymentRunsList.mockResolvedValue(
      asyncIterable([{ session_id: "sesn_1", created_at: "2026-08-01T13:00:00Z" }]),
    );
    mockSessionsRetrieve.mockResolvedValue({ status: "terminated" });
    mockFilesList.mockResolvedValue(
      asyncIterable([
        jsonFile("action-brand-1.json", "file_1"),
        jsonFile("proposal-retailer-1-abc.json", "file_2"),
        jsonFile("leap-retailer-1-xyz.json", "file_3"),
        jsonFile("unexpected.json", "file_4"),
      ]),
    );

    const actionJson = {
      brandId: "brand-1",
      retailerId: "retailer-1",
      assessmentId: "assess-1",
      title: "Close the certification gap",
      detail: "Get USDA Organic certified before your next submission window.",
      dueBy: "2026-08-08",
    };
    const proposalJson = {
      retailerId: "retailer-1",
      proposedRequirements: { minGrossMarginPct: 42 },
      sourceUrl: "https://www.wholefoodsmarket.com/suppliers",
      rationale: "Stored value is 40%, page states 42%.",
    };
    const leapJson = {
      retailerId: "retailer-1",
      programName: "Local & National Buying Window",
      summary: "Applications are open for Q4.",
      sourceUrl: "https://www.wholefoodsmarket.com/suppliers/leap",
      applicationLink: null,
    };

    mockFilesDownload.mockImplementation(async (fileId: string) => {
      const bodies: Record<string, unknown> = {
        file_1: actionJson,
        file_2: proposalJson,
        file_3: leapJson,
      };
      return { text: async () => JSON.stringify(bodies[fileId]) };
    });

    const result = await collectWeeklyScoutResults();

    expect(result.actions).toEqual([actionJson]);
    expect(result.proposals).toEqual([proposalJson]);
    expect(result.leapAlerts).toEqual([leapJson]);
    expect(result.warnings).toEqual([
      "Skipped unrecognized output file: unexpected.json",
    ]);
  });

  it("skips a malformed output file with a warning instead of throwing", async () => {
    mockDeploymentRunsList.mockResolvedValue(
      asyncIterable([{ session_id: "sesn_1", created_at: "2026-08-01T13:00:00Z" }]),
    );
    mockSessionsRetrieve.mockResolvedValue({ status: "idle" });
    mockFilesList.mockResolvedValue(
      asyncIterable([jsonFile("action-brand-1.json", "file_1")]),
    );
    mockFilesDownload.mockResolvedValue({
      text: async () => JSON.stringify({ brandId: "brand-1" }), // missing required fields
    });

    const result = await collectWeeklyScoutResults();

    expect(result.actions).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Malformed action file");
  });

  it("returns a warning (not a throw) when the session never becomes ready", async () => {
    vi.useFakeTimers();
    try {
      mockDeploymentRunsList.mockResolvedValue(
        asyncIterable([{ session_id: "sesn_1", created_at: "2026-08-01T13:00:00Z" }]),
      );
      mockSessionsRetrieve.mockResolvedValue({ status: "running" });

      const resultPromise = collectWeeklyScoutResults();
      // 5 attempts x 4s poll interval — advance past all of them without a
      // real wait.
      await vi.advanceTimersByTimeAsync(5 * 4_000);
      const result = await resultPromise;

      expect(result).toEqual({
        actions: [],
        proposals: [],
        leapAlerts: [],
        warnings: [
          "Session sesn_1 was still running after the bounded wait — will pick it up on the next collector run.",
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
