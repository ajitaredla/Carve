/**
 * Receiver for Langfuse's "Webhook" automation action (2026-08-15) — the
 * notification channel half of "wire an alert off the Langfuse data".
 * Langfuse itself has no public API for creating Alerts/Automations (only
 * UI configuration — confirmed via `langfuse-cli api __schema`, no
 * alert/automation/monitor resource exists), so THIS side — receiving the
 * webhook and actually notifying someone — is what's fully within Carve's
 * own control and testable end-to-end. See docs/production-setup.md (or
 * ask the person who ran this) for the exact Langfuse-side Alert +
 * Automation click-path to link an alert to this endpoint.
 *
 * HMAC verification matches Langfuse's own documented code exactly
 * (https://langfuse.com/docs/prompt-management/features/webhooks-slack-
 * integrations#hmac-signature-verification) — do not "simplify" it; the
 * timestamp+body concatenation and timing-safe comparison are both
 * load-bearing.
 */
import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createResendOpsAlertMailer } from "@/lib/email/ops-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per Langfuse's docs: verifies `x-langfuse-signature: t=<ts>,v1=<sig>`. */
function verifyLangfuseSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const [tsPair, sigPair] = signatureHeader.split(",");
  if (!tsPair || !sigPair) return false;

  const timestamp = tsPair.split("=")[1];
  const receivedSig = sigPair.split("=")[1];
  if (!timestamp || !receivedSig) return false;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const receivedBuf = Buffer.from(receivedSig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (receivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

/** Matches the shape documented at
 * https://langfuse.com/docs/metrics/features/alerts#automations-webhook-payload —
 * only the fields this route actually reads are declared. */
interface LangfuseAlertWebhookPayload {
  type: string;
  payload: {
    message: { title: string; body: string };
    severity: string;
    permalink?: string;
  };
}

function isLangfuseAlertWebhookPayload(value: unknown): value is LangfuseAlertWebhookPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.type !== "string" || typeof v.payload !== "object" || v.payload === null) {
    return false;
  }
  const payload = v.payload as Record<string, unknown>;
  const message = payload.message as Record<string, unknown> | undefined;
  return (
    typeof payload.severity === "string" &&
    typeof message?.title === "string" &&
    typeof message?.body === "string"
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.LANGFUSE_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[langfuse-alert-webhook] LANGFUSE_WEBHOOK_SECRET is not set — rejecting.",
    );
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-langfuse-signature");
  if (!signatureHeader || !verifyLangfuseSignature(rawBody, signatureHeader, secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isLangfuseAlertWebhookPayload(parsed)) {
    console.error("[langfuse-alert-webhook] unrecognized payload shape", parsed);
    return NextResponse.json({ error: "unrecognized_payload" }, { status: 400 });
  }

  try {
    const mailer = createResendOpsAlertMailer();
    await mailer.send({
      title: parsed.payload.message.title,
      body: parsed.payload.message.body,
      severity: parsed.payload.severity,
      permalink: parsed.payload.permalink,
    });
  } catch (error) {
    // Log and 500 rather than swallow — Langfuse disables an automation's
    // trigger after 5 consecutive delivery failures (its own documented
    // behavior), which is the right signal to surface as a real failure,
    // not hide behind a fake 200.
    console.error("[langfuse-alert-webhook] failed to send ops alert email", error);
    return NextResponse.json({ error: "delivery_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
