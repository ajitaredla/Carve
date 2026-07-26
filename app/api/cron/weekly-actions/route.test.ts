import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { findMany, send, createMailer, selectNextAction } = vi.hoisted(() => ({
  findMany: vi.fn(),
  send: vi.fn(),
  createMailer: vi.fn(),
  selectNextAction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { founder: { findMany } },
}));
vi.mock("@/lib/email/weekly-action", () => ({
  createResendWeeklyActionMailer: createMailer,
}));
vi.mock("@/lib/next-action/select", () => ({ selectNextAction }));

import { GET } from "./route";

describe("GET /api/cron/weekly-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("fails closed when the cron bearer token is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/cron/weekly-actions"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("selects and emails one current action for every assessed brand", async () => {
    findMany.mockResolvedValue([
      {
        id: "founder-1",
        name: "Avery",
        email: "avery@example.com",
        brand: {
          name: "Carve Snacks",
          assessments: [{ retailer: { name: "Carve Market" } }],
        },
      },
    ]);
    const action = {
      dimension: "margin",
      title: "Approve a margin-ready price",
      detail: "Model the required margin.",
      dueBy: "2026-08-02",
    };
    selectNextAction.mockReturnValue({ action, overallScore: 42 });
    createMailer.mockReturnValue({ send });

    const response = await GET(
      new NextRequest("http://localhost/api/cron/weekly-actions", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(selectNextAction).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      to: "avery@example.com",
      founderName: "Avery",
      brandName: "Carve Snacks",
      retailerName: "Carve Market",
      action,
    });
  });
});
