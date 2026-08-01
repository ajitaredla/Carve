/**
 * Finds the most recent carve-weekly-scout deployment run, waits (briefly,
 * boundedly) for its session to finish, then downloads and parses every
 * output file it wrote. This is the "poll a normal short-lived route"
 * design from planning — no custom tools, no long-lived listener, no
 * webhook. app/api/cron/weekly-scout-collect calls this on its own cron
 * cadence, offset an hour after the scout's own scheduled fire time, so in
 * the common case the session is already idle by the time this runs; the
 * short bounded poll below only covers the case where it's still finishing.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  ActionOutputSchema,
  LeapAlertOutputSchema,
  ProposalOutputSchema,
  classifyOutputFilename,
  type ActionOutput,
  type LeapAlertOutput,
  type ProposalOutput,
} from "./output-schemas";

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";
const SESSION_READY_MAX_ATTEMPTS = 5;
const SESSION_READY_POLL_MS = 4_000;

export interface CollectResult {
  actions: ActionOutput[];
  proposals: ProposalOutput[];
  leapAlerts: LeapAlertOutput[];
  /** Human-readable notes on anything skipped — a bad file, an unfinished
   * session, etc. Never thrown; the caller decides what (if anything) to do
   * with a partial result. */
  warnings: string[];
}

export class ScoutCollectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoutCollectionError";
  }
}

async function findLatestRunSessionId(deploymentId: string): Promise<string | null> {
  const runs = await getClient().beta.deploymentRuns.list({
    deployment_id: deploymentId,
    has_error: false,
    limit: 10,
  });

  let latest: { sessionId: string; createdAt: string } | null = null;
  for await (const run of runs) {
    if (!run.session_id) continue;
    if (!latest || run.created_at > latest.createdAt) {
      latest = { sessionId: run.session_id, createdAt: run.created_at };
    }
  }
  return latest?.sessionId ?? null;
}

async function waitForSessionReady(sessionId: string): Promise<boolean> {
  for (let attempt = 0; attempt < SESSION_READY_MAX_ATTEMPTS; attempt++) {
    const session = await getClient().beta.sessions.retrieve(sessionId);
    if (session.status === "idle" || session.status === "terminated") {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, SESSION_READY_POLL_MS));
  }
  return false;
}

export async function collectWeeklyScoutResults(): Promise<CollectResult> {
  const deploymentId = process.env.CARVE_SCOUT_DEPLOYMENT_ID;
  if (!deploymentId) {
    throw new ScoutCollectionError("CARVE_SCOUT_DEPLOYMENT_ID is not set.");
  }

  const warnings: string[] = [];
  const sessionId = await findLatestRunSessionId(deploymentId);
  if (!sessionId) {
    warnings.push("No successful deployment run found yet — nothing to collect.");
    return { actions: [], proposals: [], leapAlerts: [], warnings };
  }

  const ready = await waitForSessionReady(sessionId);
  if (!ready) {
    warnings.push(
      `Session ${sessionId} was still running after the bounded wait — will pick it up on the next collector run.`,
    );
    return { actions: [], proposals: [], leapAlerts: [], warnings };
  }

  const client = getClient();
  const files = await client.beta.files.list({
    scope_id: sessionId,
    betas: [MANAGED_AGENTS_BETA],
  });

  const actions: ActionOutput[] = [];
  const proposals: ProposalOutput[] = [];
  const leapAlerts: LeapAlertOutput[] = [];

  for await (const file of files) {
    const kind = classifyOutputFilename(file.filename);
    if (!kind) {
      warnings.push(`Skipped unrecognized output file: ${file.filename}`);
      continue;
    }

    let parsedJson: unknown;
    try {
      const response = await client.beta.files.download(file.id);
      parsedJson = JSON.parse(await response.text());
    } catch (error) {
      warnings.push(
        `Failed to download/parse ${file.filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    if (kind === "action") {
      const result = ActionOutputSchema.safeParse(parsedJson);
      if (!result.success) {
        warnings.push(`Malformed action file ${file.filename}: ${result.error.message}`);
        continue;
      }
      actions.push(result.data);
    } else if (kind === "proposal") {
      const result = ProposalOutputSchema.safeParse(parsedJson);
      if (!result.success) {
        warnings.push(`Malformed proposal file ${file.filename}: ${result.error.message}`);
        continue;
      }
      proposals.push(result.data);
    } else {
      const result = LeapAlertOutputSchema.safeParse(parsedJson);
      if (!result.success) {
        warnings.push(`Malformed leap file ${file.filename}: ${result.error.message}`);
        continue;
      }
      leapAlerts.push(result.data);
    }
  }

  return { actions, proposals, leapAlerts, warnings };
}
