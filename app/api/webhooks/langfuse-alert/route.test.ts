import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { send, createMailer } = vi.hoisted(() => ({
  send: vi.fn(),
  createMailer: vi.fn(),
}));

vi.mock("@/lib/email/ops-alert", () => ({
  createResendOpsAlertMailer: createMailer,
}));

import { POST } from "./route";

const SECRET = "test-langfuse-webhook-secret";

function signedRequest(body: unknown, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const rawBody = JSON.stringify(body);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  return new NextRequest("http://localhost/api/webhooks/langfuse-alert", {
    method: "POST",
    headers: { "x-langfuse-signature": `t=${timestamp},v1=${signature}` },
    body: rawBody,
  });
}

const VALID_PAYLOAD = {
  id: "evt-1",
  timestamp: "2026-08-15T00:00:00Z",
  type: "monitor-alert",
  apiVersion: "v1",
  payload: {
    monitorId: "monitor_abc",
    message: { title: "avg cost crossed alert threshold", body: "cost is $6 (threshold: $5) over 1h" },
    severity: "ALERT",
    permalink: "https://cloud.langfuse.com/project/x/monitors/monitor_abc",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LANGFUSE_WEBHOOK_SECRET = SECRET;
  createMailer.mockReturnValue({ send });
  send.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.LANGFUSE_WEBHOOK_SECRET;
});

describe("POST /api/webhooks/langfuse-alert", () => {
  it("rejects when LANGFUSE_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.LANGFUSE_WEBHOOK_SECRET;
    const response = await POST(signedRequest(VALID_PAYLOAD));
    expect(response.status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature header", async () => {
    const request = new NextRequest("http://localhost/api/webhooks/langfuse-alert", {
      method: "POST",
      body: JSON.stringify(VALID_PAYLOAD),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a request signed with the WRONG secret", async () => {
    const response = await POST(signedRequest(VALID_PAYLOAD, "wrong-secret"));
    expect(response.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a tampered body (signature no longer matches)", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify(VALID_PAYLOAD);
    const signature = crypto
      .createHmac("sha256", SECRET)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("hex");
    const tamperedBody = JSON.stringify({ ...VALID_PAYLOAD, payload: { ...VALID_PAYLOAD.payload, severity: "OK" } });
    const request = new NextRequest("http://localhost/api/webhooks/langfuse-alert", {
      method: "POST",
      headers: { "x-langfuse-signature": `t=${timestamp},v1=${signature}` },
      body: tamperedBody,
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a payload missing the expected shape, even with a valid signature", async () => {
    const response = await POST(signedRequest({ not: "a langfuse alert" }));
    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends an ops alert email for a validly-signed, well-shaped payload", async () => {
    const response = await POST(signedRequest(VALID_PAYLOAD));

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledWith({
      title: "avg cost crossed alert threshold",
      body: "cost is $6 (threshold: $5) over 1h",
      severity: "ALERT",
      permalink: "https://cloud.langfuse.com/project/x/monitors/monitor_abc",
    });
  });

  it("returns 500 (not a fake 200) when email delivery fails", async () => {
    send.mockRejectedValue(new Error("Resend down"));
    const response = await POST(signedRequest(VALID_PAYLOAD));
    expect(response.status).toBe(500);
  });
});
