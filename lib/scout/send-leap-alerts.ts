/**
 * Sends LEAP-style program-announcement alerts (PRD FR-10) to every founder
 * whose current assessment targets the retailer that fired the alert. No
 * opt-in preference exists (a deliberate v1 simplification from planning —
 * no schema exists for one yet) — targeting is simply "founder currently
 * assessed against this retailer." Deduped via LeapAlertLog so the same
 * open announcement doesn't re-email every founder each week it's detected
 * again.
 */

import { createHash } from "node:crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import type { LeapAlertOutput } from "./output-schemas";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

function hashAlert(alert: LeapAlertOutput): string {
  return createHash("sha256")
    .update(`${alert.retailerId}|${alert.programName}|${alert.summary}|${alert.sourceUrl}`)
    .digest("hex");
}

export interface SendLeapAlertsResult {
  sent: number;
  skippedDuplicate: number;
  failed: string[];
}

export async function sendLeapAlerts(
  alerts: LeapAlertOutput[],
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.RESEND_FROM_EMAIL,
): Promise<SendLeapAlertsResult> {
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.");
  }
  const resend = new Resend(apiKey);

  let sent = 0;
  let skippedDuplicate = 0;
  const failed: string[] = [];

  for (const alert of alerts) {
    const contentHash = hashAlert(alert);
    try {
      const existing = await prisma.leapAlertLog.findFirst({
        where: { retailerId: alert.retailerId, contentHash },
      });
      if (existing) {
        skippedDuplicate += 1;
        continue;
      }

      const targets = await prisma.assessment.findMany({
        where: { retailerId: alert.retailerId },
        select: { brand: { select: { founder: { select: { email: true, name: true } } } } },
      });

      for (const { brand } of targets) {
        const result = await resend.emails.send({
          from,
          to: brand.founder.email,
          subject: `${alert.programName} is open`,
          html: [
            `<h1>${escapeHtml(alert.programName)}</h1>`,
            `<p>Hi ${escapeHtml(brand.founder.name)},</p>`,
            `<p>${escapeHtml(alert.summary)}</p>`,
            `<p><a href="${escapeHtml(alert.sourceUrl)}">Program details</a></p>`,
            alert.applicationLink
              ? `<p><a href="${escapeHtml(alert.applicationLink)}">Apply</a></p>`
              : "",
          ].join(""),
        });
        if (result.error) {
          throw new Error(`Resend rejected the LEAP alert email: ${result.error.message}`);
        }
      }

      await prisma.leapAlertLog.create({
        data: { retailerId: alert.retailerId, contentHash },
      });
      sent += targets.length;
    } catch (error) {
      console.error("[weekly-scout-collect] leap alert delivery failed", {
        retailerId: alert.retailerId,
        error,
      });
      failed.push(alert.retailerId);
    }
  }

  return { sent, skippedDuplicate, failed };
}
