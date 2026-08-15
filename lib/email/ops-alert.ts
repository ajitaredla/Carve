/**
 * Ops-facing alert email — the notification half of the Langfuse alert
 * wiring (2026-08-15). Deliberately separate from
 * lib/email/weekly-action.ts's founder-facing mailer: different audience
 * (Carve's own operator, not a founder), different content (a threshold
 * breach on cost/quality metrics, not a product action), and a different
 * recipient config (CARVE_OPS_ALERT_EMAIL, not a per-founder address) —
 * conflating the two would make it easy to accidentally send an internal
 * alert to a founder or vice versa.
 */
import { Resend } from "resend";

export interface OpsAlertInput {
  title: string;
  body: string;
  severity: string;
  permalink?: string;
}

export interface OpsAlertMailer {
  send(input: OpsAlertInput): Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

export function createResendOpsAlertMailer(
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.RESEND_FROM_EMAIL,
  to = process.env.CARVE_OPS_ALERT_EMAIL,
): OpsAlertMailer {
  if (!apiKey || !from || !to) {
    throw new Error(
      "RESEND_API_KEY, RESEND_FROM_EMAIL, and CARVE_OPS_ALERT_EMAIL must all be configured.",
    );
  }

  const resend = new Resend(apiKey);
  return {
    async send(input) {
      const linkHtml = input.permalink
        ? `<p><a href="${escapeHtml(input.permalink)}">View in Langfuse</a></p>`
        : "";
      const result = await resend.emails.send({
        from,
        to,
        subject: `[Carve AI alert — ${input.severity}] ${input.title}`,
        html:
          `<h1>Carve AI alert</h1>` +
          `<p><strong>Severity:</strong> ${escapeHtml(input.severity)}</p>` +
          `<p><strong>${escapeHtml(input.title)}</strong></p>` +
          `<p>${escapeHtml(input.body)}</p>${linkHtml}`,
      });
      if (result.error) {
        throw new Error(`Resend rejected the ops alert email: ${result.error.message}`);
      }
    },
  };
}
