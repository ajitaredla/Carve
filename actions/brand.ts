"use server";

/**
 * Task 7.1 — Intake/onboarding form (US-01). Server Action backing
 * `app/(dashboard)/assessment/new/page.tsx` / `components/assessment/
 * intake-form.tsx`.
 *
 * Since `Brand` is one-per-founder (task 1.0/6.6b's design), this single
 * action handles BOTH cases the form supports:
 *   - First-ever brand: no `Brand` row exists for this founder yet — this
 *     creates it.
 *   - "Assess against another retailer": a `Brand` row already exists — this
 *     updates its facts (the founder may have changed a price, added a
 *     certification, etc. since their last submission) and runs a NEW
 *     assessment against whichever retailer was selected this time.
 * `prisma.brand.upsert({ where: { founderId } })` makes both cases the same
 * code path — `Brand.founderId` is `@unique`, so there is exactly one row to
 * create-or-update per founder.
 *
 * Validation: `lib/intake/brand-intake-schema.ts` is the one source of truth
 * for field-level validation (wholesalePrice/retailPrice > 0, leadTimeDays
 * bounds, the isDtcOnly/unitsPerStorePerWeek cross-field requirement) — see
 * that file's header for exactly which gaps this closes (per 6.9's architect
 * review, none caught by any other layer). Re-validated here server-side
 * even though the client form also validates, since Server Actions are a
 * public RPC surface a crafted request could call directly.
 *
 * Error handling: `generateBlockerStatement` (`actions/assessment.ts`)
 * throws rather than returning an error state (documented there, and in
 * 6.9's architect review) — wrapped here with `toFriendlyGenerationError`
 * (lib/errors/friendly.ts), the same triage helper `actions/generation-
 * ui.ts` uses for 7.2/7.3's regenerate flows. If scoring already succeeded
 * (the Assessment row exists) before generation itself fails, this action
 * still routes the founder to their new assessment — losing all their intake
 * work over an AI hiccup would be a needless regression, and the assessment
 * page's own "not started, try again" state (7.2) picks up cleanly from
 * there.
 */

import { prisma } from "@/lib/prisma";
import { getCurrentFounderAndBrand } from "@/lib/auth/current-brand";
import { generateBlockerStatement } from "@/actions/assessment";
import { toFriendlyGenerationError } from "@/lib/errors/friendly";
import {
  validateBrandIntake,
} from "@/lib/intake/brand-intake-schema";

export type SaveBrandIntakeResult =
  | {
      status: "success";
      assessmentId: string;
      /** "final"/"needs_review" mirror `generateBlockerStatement`'s own
       * result; "pending" means scoring succeeded but the blocker-statement
       * generation call itself failed (session-level error) — the founder is
       * still routed to their assessment, which can retry generation from
       * there. */
      blockerStatus: "final" | "needs_review" | "pending";
    }
  | { status: "validation_error"; fieldErrors: Record<string, string> }
  | { status: "error"; message: string };

export async function saveBrandIntakeAndAssess(
  rawInput: unknown,
): Promise<SaveBrandIntakeResult> {
  const validation = validateBrandIntake(rawInput);
  if (!validation.success || !validation.data) {
    return { status: "validation_error", fieldErrors: validation.fieldErrors };
  }
  const input = validation.data;

  const founder = await getCurrentFounderAndBrand();
  if (!founder) {
    return {
      status: "error",
      message:
        "Your account isn't fully set up yet. Please contact support.",
    };
  }

  const retailer = await prisma.retailer.findUnique({
    where: { slug: input.retailerSlug },
  });
  if (!retailer) {
    return {
      status: "validation_error",
      fieldErrors: { retailerSlug: "Please choose a valid retailer." },
    };
  }

  const brandData = {
    name: input.name,
    category: input.category,
    dtcAnnualRevenue: input.dtcAnnualRevenue,
    description: input.description || null,
    wholesalePrice: input.wholesalePrice,
    retailPrice: input.retailPrice,
    hasKeheRelationship: input.hasKeheRelationship,
    hasUnfiRelationship: input.hasUnfiRelationship,
    ediCapable: input.ediCapable,
    eftCapable: input.eftCapable,
    heldCertifications: input.heldCertifications,
    isDtcOnly: input.isDtcOnly,
    // toScoringInput ignores this when isDtcOnly (see file header) — persist
    // `null` rather than a stale number so the DB row never implies velocity
    // data that isn't actually being scored.
    unitsPerStorePerWeek: input.isDtcOnly
      ? null
      : (input.unitsPerStorePerWeek ?? null),
    hasCoManufacturer: input.hasCoManufacturer,
    leadTimeDays: input.leadTimeDays,
    hasRegionalProductionCapacity: input.hasRegionalProductionCapacity,
  };

  let brand;
  try {
    brand = await prisma.brand.upsert({
      where: { founderId: founder.id },
      create: { founderId: founder.id, ...brandData },
      update: brandData,
    });
  } catch (error) {
    console.error("[saveBrandIntakeAndAssess] failed to save brand", error);
    return {
      status: "error",
      message: "We couldn't save your brand details. Please try again.",
    };
  }

  try {
    const result = await generateBlockerStatement(retailer.slug);
    return {
      status: "success",
      assessmentId: result.assessmentId,
      blockerStatus: result.status,
    };
  } catch (error) {
    // Scoring (upsertAssessmentScores) runs BEFORE generation inside
    // generateBlockerStatement — if that part succeeded, an Assessment row
    // exists even though this catch fired. Recover it so intake work isn't
    // lost over an AI-layer failure.
    const existing = await prisma.assessment.findUnique({
      where: {
        brandId_retailerId: { brandId: brand.id, retailerId: retailer.id },
      },
    });
    if (existing) {
      return {
        status: "success",
        assessmentId: existing.id,
        blockerStatus: "pending",
      };
    }

    const friendly = toFriendlyGenerationError(
      error,
      "saveBrandIntakeAndAssess",
    );
    return { status: "error", message: friendly.message };
  }
}
