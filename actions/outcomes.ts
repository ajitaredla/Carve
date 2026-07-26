"use server";

/**
 * Task 6.6 — "Log My Result" outcome logging (FR-07).
 *
 * "A 'Log My Result' action lets a founder record the outcome of a retailer
 * submission — won, rejected, or still pending — against that brand's
 * assessment history. This closes the v1 PO-path loop: intake, score,
 * blocker, waterfall, documents, outcome." (PRD §6.1 FR-07)
 *
 * No AI generation involved — this is a plain, deterministic write. The only
 * things worth getting right here are the two ownership checks: `brandId`
 * comes from `requireCurrentBrand()` (never trusted from the caller — see
 * `lib/auth/current-brand.ts`), and an optional `assessmentId` is verified to
 * actually belong to that same brand before being linked, the same
 * ownership-check convention `actions/documents.ts` uses for its own optional
 * assessment lookup.
 *
 * ---------------------------------------------------------------------------
 * assessmentId auto-resolution (added per 6.8's product review)
 * ---------------------------------------------------------------------------
 *
 * FR-07's own language is "record the outcome... against that brand's
 * assessment history" — a claim about linkage, not just brand+retailer
 * co-location. Originally `assessmentId` was purely caller-supplied-or-null,
 * which meant a caller (the not-yet-built 7.x UI) that simply forgot to pass
 * it would silently produce an unlinked `Outcome` row, weakening exactly the
 * traceability FR-07 promises — for no good reason, since a deterministic
 * mapping already exists via `Assessment`'s `@@unique([brandId, retailerId])`
 * constraint (task 6.6b). Now: if the caller doesn't supply `assessmentId`,
 * this function looks up the brand's current assessment for that retailer
 * and links it automatically. `assessmentId` stays genuinely `null` only
 * when no assessment has ever been run for this brand+retailer pair — a
 * legitimate case (e.g. logging an outcome for a retailer approached outside
 * Carve entirely), not a caller oversight.
 *
 * Caveat carried over from 6.8's review, not solved by this function: because
 * `Assessment` rows are upserted in place (6.6b's deliberate "no unbounded
 * history" decision), even a correctly-linked `assessmentId` points to
 * whatever that row says NOW, not a point-in-time snapshot of what it said
 * when this outcome was logged. `GenerationLog` has true point-in-time
 * snapshots; `Outcome` -> `Assessment` does not. Known v1 tradeoff.
 */

import { prisma } from "@/lib/prisma";
import { requireCurrentBrand } from "@/lib/auth/current-brand";

export type OutcomeStatus = "won" | "rejected" | "pending";

const OUTCOME_STATUSES: readonly OutcomeStatus[] = [
  "won",
  "rejected",
  "pending",
];

export interface LogOutcomeInput {
  retailerId: string;
  status: OutcomeStatus;
  notes?: string;
  assessmentId?: string;
}

export interface LoggedOutcome {
  id: string;
  brandId: string;
  retailerId: string;
  assessmentId: string | null;
  status: OutcomeStatus;
  notes: string | null;
  loggedAt: Date;
}

export async function logOutcome(
  input: LogOutcomeInput,
): Promise<LoggedOutcome> {
  if (!OUTCOME_STATUSES.includes(input.status)) {
    throw new Error(
      `Invalid outcome status "${input.status}" — must be one of: ${OUTCOME_STATUSES.join(", ")}.`,
    );
  }

  const brand = await requireCurrentBrand();

  const retailer = await prisma.retailer.findUnique({
    where: { id: input.retailerId },
  });
  if (!retailer) {
    throw new Error(`No retailer found with id "${input.retailerId}".`);
  }

  let assessmentId: string | null = null;

  if (input.assessmentId) {
    const assessment = await prisma.assessment.findUnique({
      where: { id: input.assessmentId },
    });
    if (!assessment) {
      throw new Error(
        `No assessment found with id "${input.assessmentId}".`,
      );
    }
    if (assessment.brandId !== brand.id) {
      throw new Error(
        `Assessment "${input.assessmentId}" does not belong to the current brand.`,
      );
    }
    assessmentId = assessment.id;
  } else {
    // Auto-resolve via the deterministic brand+retailer mapping (see file
    // header) rather than leaving the outcome unlinked by default.
    const currentAssessment = await prisma.assessment.findUnique({
      where: {
        brandId_retailerId: { brandId: brand.id, retailerId: input.retailerId },
      },
    });
    assessmentId = currentAssessment?.id ?? null;
  }

  const outcome = await prisma.outcome.create({
    data: {
      brandId: brand.id,
      retailerId: input.retailerId,
      assessmentId,
      status: input.status,
      notes: input.notes ?? null,
    },
  });

  return {
    id: outcome.id,
    brandId: outcome.brandId,
    retailerId: outcome.retailerId,
    assessmentId: outcome.assessmentId,
    status: outcome.status as OutcomeStatus,
    notes: outcome.notes,
    loggedAt: outcome.loggedAt,
  };
}
