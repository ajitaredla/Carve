import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { collectWeeklyScoutResults, deliverScoutActions, stageProposals, sendLeapAlerts } =
  vi.hoisted(() => ({
    collectWeeklyScoutResults: vi.fn(),
    deliverScoutActions: vi.fn(),
    stageProposals: vi.fn(),
    sendLeapAlerts: vi.fn(),
  }));

vi.mock("@/lib/scout/collect", () => ({ collectWeeklyScoutResults }));
vi.mock("@/lib/scout/deliver-action", () => ({ deliverScoutActions }));
vi.mock("@/lib/scout/stage-proposal", () => ({ stageProposals }));
vi.mock("@/lib/scout/send-leap-alerts", () => ({ sendLeapAlerts }));

import { GET } from "./route";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/cron/weekly-scout-collect", { headers });
}

describe("GET /api/cron/weekly-scout-collect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("fails closed when the cron bearer token is missing", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(collectWeeklyScoutResults).not.toHaveBeenCalled();
  });

  it("returns 503 without touching delivery when collection itself fails", async () => {
    collectWeeklyScoutResults.mockRejectedValue(new Error("deployment id not set"));

    const response = await GET(request({ Authorization: "Bearer test-cron-secret" }));

    expect(response.status).toBe(503);
    expect(deliverScoutActions).not.toHaveBeenCalled();
  });

  it("runs all three delivery steps and summarizes their results", async () => {
    collectWeeklyScoutResults.mockResolvedValue({
      actions: [{ brandId: "brand-1" }],
      proposals: [{ retailerId: "retailer-1" }],
      leapAlerts: [{ retailerId: "retailer-1" }],
      warnings: ["Skipped unrecognized output file: extra.json"],
    });
    deliverScoutActions.mockResolvedValue({ sent: 1, failed: [] });
    stageProposals.mockResolvedValue({ staged: 1, failed: [] });
    sendLeapAlerts.mockResolvedValue({ sent: 2, skippedDuplicate: 0, failed: [] });

    const response = await GET(request({ Authorization: "Bearer test-cron-secret" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      actionsSent: 1,
      actionsFailed: 0,
      proposalsStaged: 1,
      proposalsFailed: 0,
      leapAlertsSent: 2,
      leapAlertsSkippedDuplicate: 0,
      warnings: 1,
    });
  });

  it("keeps proposal staging and leap alerts working when action delivery throws (Resend unconfigured)", async () => {
    collectWeeklyScoutResults.mockResolvedValue({
      actions: [{ brandId: "brand-1" }],
      proposals: [{ retailerId: "retailer-1" }],
      leapAlerts: [],
      warnings: [],
    });
    deliverScoutActions.mockRejectedValue(
      new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured."),
    );
    stageProposals.mockResolvedValue({ staged: 1, failed: [] });
    sendLeapAlerts.mockResolvedValue({ sent: 0, skippedDuplicate: 0, failed: [] });

    const response = await GET(request({ Authorization: "Bearer test-cron-secret" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      actionsSent: 0,
      actionsFailed: 0,
      proposalsStaged: 1,
      proposalsFailed: 0,
      leapAlertsSent: 0,
      leapAlertsSkippedDuplicate: 0,
      warnings: 0,
    });
  });
});
