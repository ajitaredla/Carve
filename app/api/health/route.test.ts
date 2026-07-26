import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: queryRaw },
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("reports ready only when Postgres is reachable", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("does not expose database errors when the readiness check fails", async () => {
    queryRaw.mockRejectedValue(new Error("connection password rejected"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });
});
