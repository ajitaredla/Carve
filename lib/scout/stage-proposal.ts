/**
 * Stages retailer-requirement corrections carve-retailer-freshness found —
 * never applies them. See prisma/schema.prisma's RetailerRequirementProposal
 * doc comment and agents/carve-retailer-freshness.agent.yaml's file header
 * for why an LLM's read of a web page is a different trust tier than
 * Carve's own database: this table exists specifically so that distinction
 * is enforced structurally, not just by convention.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProposalOutput } from "./output-schemas";

export interface StageProposalsResult {
  staged: number;
  failed: string[];
}

export async function stageProposals(
  proposals: ProposalOutput[],
): Promise<StageProposalsResult> {
  let staged = 0;
  const failed: string[] = [];

  for (const proposal of proposals) {
    try {
      await prisma.retailerRequirementProposal.create({
        data: {
          retailerId: proposal.retailerId,
          proposedRequirements: proposal.proposedRequirements as Prisma.InputJsonValue,
          sourceUrl: proposal.sourceUrl,
          rationale: proposal.rationale,
        },
      });
      staged += 1;
    } catch (error) {
      console.error("[weekly-scout-collect] proposal staging failed", {
        retailerId: proposal.retailerId,
        error,
      });
      failed.push(proposal.retailerId);
    }
  }

  return { staged, failed };
}
