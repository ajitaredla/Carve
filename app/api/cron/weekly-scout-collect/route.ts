import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { collectWeeklyScoutResults } from "@/lib/scout/collect";
import { deliverScoutActions } from "@/lib/scout/deliver-action";
import { stageProposals } from "@/lib/scout/stage-proposal";
import { sendLeapAlerts } from "@/lib/scout/send-leap-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same bearer-token shape as app/api/cron/weekly-actions/route.ts:12-21 —
// reuses CRON_SECRET rather than a new secret, since this is the same kind
// of caller (the weekly-scout-collect.yml GitHub Actions cron).
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

  let collected;
  try {
    collected = await collectWeeklyScoutResults();
  } catch (error) {
    console.error("[weekly-scout-collect] collection failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  for (const warning of collected.warnings) {
    console.warn("[weekly-scout-collect]", warning);
  }

  // Each delivery step is independent — a Resend outage shouldn't prevent
  // proposals from being staged, and vice versa. Same "one failure doesn't
  // sink the run" posture as weekly-actions/route.ts's per-founder loop,
  // just at the step level instead of the item level here since each step
  // already does its own per-item try/catch internally.
  const results = await Promise.allSettled([
    deliverScoutActions(collected.actions),
    stageProposals(collected.proposals),
    sendLeapAlerts(collected.leapAlerts),
  ]);

  const [actionsResult, proposalsResult, leapResult] = results;

  if (actionsResult.status === "rejected") {
    console.error("[weekly-scout-collect] action delivery step failed", actionsResult.reason);
  }
  if (proposalsResult.status === "rejected") {
    console.error("[weekly-scout-collect] proposal staging step failed", proposalsResult.reason);
  }
  if (leapResult.status === "rejected") {
    console.error("[weekly-scout-collect] leap alert step failed", leapResult.reason);
  }

  return NextResponse.json({
    actionsSent: actionsResult.status === "fulfilled" ? actionsResult.value.sent : 0,
    actionsFailed: actionsResult.status === "fulfilled" ? actionsResult.value.failed.length : 0,
    proposalsStaged: proposalsResult.status === "fulfilled" ? proposalsResult.value.staged : 0,
    proposalsFailed: proposalsResult.status === "fulfilled" ? proposalsResult.value.failed.length : 0,
    leapAlertsSent: leapResult.status === "fulfilled" ? leapResult.value.sent : 0,
    leapAlertsSkippedDuplicate:
      leapResult.status === "fulfilled" ? leapResult.value.skippedDuplicate : 0,
    warnings: collected.warnings.length,
  });
}
