/**
 * Delivers carve-weekly-scout's drafted actions by email. A deliberately
 * separate, self-contained mailer from lib/email/weekly-action.ts rather
 * than reusing its WeeklyActionMailer interface — that interface's
 * WeeklyAction shape carries `dimension`/`template` fields the LLM-authored
 * ActionOutput doesn't have, and forcing a fake dimension onto every scout
 * action just to satisfy an unrelated type would be a worse coupling than
 * a few duplicated lines. Same guard-and-throw-if-unconfigured behavior as
 * that file, so RESEND_API_KEY/RESEND_FROM_EMAIL stay the single on/off
 * switch for all outbound email in this app.
 */

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import type { ActionOutput } from "./output-schemas";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

export interface DeliverActionsResult {
  sent: number;
  failed: string[];
}

/**
 * Throws the same "must be configured" error as
 * createResendWeeklyActionMailer whenever RESEND_API_KEY/RESEND_FROM_EMAIL
 * aren't set — callers should let this abort the whole delivery step, not
 * try to send some actions and silently skip the rest.
 */
export async function deliverScoutActions(
  actions: ActionOutput[],
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.RESEND_FROM_EMAIL,
): Promise<DeliverActionsResult> {
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.");
  }
  const resend = new Resend(apiKey);

  let sent = 0;
  const failed: string[] = [];

  for (const action of actions) {
    try {
      const brand = await prisma.brand.findUnique({
        where: { id: action.brandId },
        include: { founder: true },
      });
      if (!brand) {
        failed.push(action.brandId);
        continue;
      }
      const retailer = await prisma.retailer.findUnique({
        where: { id: action.retailerId },
        select: { name: true },
      });

      const result = await resend.emails.send({
        from,
        to: brand.founder.email,
        subject: `Carve weekly action: ${action.title}`,
        html: [
          "<h1>Your next retail-readiness action</h1>",
          `<p>Hi ${escapeHtml(brand.founder.name)},</p>`,
          `<p><strong>${escapeHtml(action.title)}</strong></p>`,
          `<p>${escapeHtml(action.detail)}</p>`,
          `<p><strong>Complete by:</strong> ${escapeHtml(action.dueBy)}</p>`,
          `<p>Brand: ${escapeHtml(brand.name)}${retailer ? ` · Retailer: ${escapeHtml(retailer.name)}` : ""}</p>`,
        ].join(""),
      });
      if (result.error) {
        throw new Error(`Resend rejected the scout action email: ${result.error.message}`);
      }
      sent += 1;
    } catch (error) {
      console.error("[weekly-scout-collect] action delivery failed", {
        brandId: action.brandId,
        error,
      });
      failed.push(action.brandId);
    }
  }

  return { sent, failed };
}
