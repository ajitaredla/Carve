import { Resend } from "resend";

import type { WeeklyAction } from "@/lib/next-action/select";

export interface WeeklyActionEmailInput {
  to: string;
  founderName: string;
  brandName: string;
  retailerName: string;
  action: WeeklyAction;
}

export interface WeeklyActionMailer {
  send(input: WeeklyActionEmailInput): Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

export function createResendWeeklyActionMailer(
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.RESEND_FROM_EMAIL,
): WeeklyActionMailer {
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.");
  }

  const resend = new Resend(apiKey);
  return {
    async send(input) {
      const template = input.action.template
        ? `<h2>Draft template</h2><pre>${escapeHtml(input.action.template)}</pre>`
        : "";
      const result = await resend.emails.send({
        from,
        to: input.to,
        subject: `Carve weekly action: ${input.action.title}`,
        html: `<h1>Your next retail-readiness action</h1><p>Hi ${escapeHtml(input.founderName)},</p><p><strong>${escapeHtml(input.action.title)}</strong></p><p>${escapeHtml(input.action.detail)}</p><p><strong>Complete by:</strong> ${escapeHtml(input.action.dueBy)}</p><p>Brand: ${escapeHtml(input.brandName)} · Retailer: ${escapeHtml(input.retailerName)}</p>${template}`,
      });
      if (result.error) {
        throw new Error(`Resend rejected the weekly action email: ${result.error.message}`);
      }
    },
  };
}
