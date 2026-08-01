/**
 * Zod schemas for the JSON files carve-weekly-scout (the coordinator agent,
 * see agents/carve-weekly-scout.agent.yaml) writes to
 * /mnt/session/outputs/ during its scheduled run. These shapes are pasted
 * verbatim into that agent's own system prompt — keep both in sync; a
 * mismatch here means the agent's real output silently fails to parse.
 *
 * lib/scout/collect.ts uses these to validate each downloaded output file
 * before handing it to a delivery function — malformed content from an LLM
 * is an expected failure mode to guard against, not something to trust.
 */

import { z } from "zod";

export const ActionOutputSchema = z
  .object({
    brandId: z.string().min(1),
    retailerId: z.string().min(1),
    assessmentId: z.string().min(1),
    title: z.string().min(1),
    detail: z.string().min(1),
    dueBy: z.string().min(1),
  })
  .strict();

export type ActionOutput = z.infer<typeof ActionOutputSchema>;

// Matches the shape of Retailer.requirements (prisma/schema.prisma) closely
// enough for the coordinator to propose corrected fields — deliberately
// z.unknown() for the value rather than mirroring every field, since
// Retailer.requirements has no fixed schema at the DB level either (see
// lib/mcp/tools.ts's get_retailer_requirements doc comment: "do not assume
// a fixed schema beyond what's actually present"). Structural validation
// belongs to whoever reviews and approves the proposal, not this parser.
export const ProposalOutputSchema = z
  .object({
    retailerId: z.string().min(1),
    proposedRequirements: z.record(z.string(), z.unknown()),
    sourceUrl: z.string().min(1),
    rationale: z.string().min(1),
  })
  .strict();

export type ProposalOutput = z.infer<typeof ProposalOutputSchema>;

export const LeapAlertOutputSchema = z
  .object({
    retailerId: z.string().min(1),
    programName: z.string().min(1),
    summary: z.string().min(1),
    sourceUrl: z.string().min(1),
    applicationLink: z.string().nullable(),
  })
  .strict();

export type LeapAlertOutput = z.infer<typeof LeapAlertOutputSchema>;

/**
 * Classifies an output filename into which schema should parse it, mirroring
 * the naming convention in the coordinator's own system prompt
 * (action-{brandId}.json / proposal-{retailerId}-{suffix}.json /
 * leap-{retailerId}-{suffix}.json). Returns null for anything else — an
 * unrecognized filename is skipped, not an error, since a future prompt
 * change adding a new file kind shouldn't crash the collector.
 */
export function classifyOutputFilename(
  filename: string,
): "action" | "proposal" | "leap" | null {
  if (filename.startsWith("action-")) return "action";
  if (filename.startsWith("proposal-")) return "proposal";
  if (filename.startsWith("leap-")) return "leap";
  return null;
}
