import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createResendWeeklyActionMailer } from "@/lib/email/weekly-action";
import { selectNextAction } from "@/lib/next-action/select";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const value = request.headers.get("authorization");
  if (!secret || !value?.startsWith("Bearer ")) return false;
  const token = value.slice("Bearer ".length);
  const a = Buffer.from(secret);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let founders;
  let mailer;
  try {
    founders = await prisma.founder.findMany({
      where: { brand: { is: { assessments: { some: {} } } } },
      include: { brand: { include: { assessments: { include: { retailer: true } } } } },
    });
    mailer = createResendWeeklyActionMailer();
  } catch (error) {
    console.error("[weekly-actions] job setup failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  let sent = 0;
  const failures: string[] = [];

  for (const founder of founders) {
    if (!founder.brand) continue;
    try {
      const candidates = founder.brand.assessments.map((assessment) => ({
        assessment,
        ...selectNextAction(founder.brand!, assessment.retailer),
      }));
      const selected = candidates.sort((a, b) => a.overallScore - b.overallScore)[0];
      if (!selected) continue;
      await mailer.send({
        to: founder.email,
        founderName: founder.name,
        brandName: founder.brand.name,
        retailerName: selected.assessment.retailer.name,
        action: selected.action,
      });
      sent += 1;
    } catch (error) {
      console.error("[weekly-actions] delivery failed", { founderId: founder.id, error });
      failures.push(founder.id);
    }
  }

  return NextResponse.json({ sent, failed: failures.length });
}
