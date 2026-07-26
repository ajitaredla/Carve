/**
 * Task 7.1 — the intake form's validation schema, extracted into its own
 * pure module (no Prisma import) so it's unit-testable without mocking the
 * database, and so `actions/brand.ts` and `components/assessment/intake-
 * form.tsx` share exactly one source of truth for what "valid" means.
 *
 * Per 6.9's architect review (the exact gaps this schema exists to close,
 * none caught by any other layer):
 *   - `wholesalePrice` has NO guard anywhere else in the codebase except
 *     `retailPrice`'s own `<= 0` guard inside `scoreMarginReadiness` — a
 *     zero/negative wholesale price would otherwise silently flow into
 *     scoring. This form is the only place that can catch it.
 *   - `leadTimeDays: Int` has no min/max anywhere — bounded here to 0-365.
 *   - `unitsPerStorePerWeek` is conditionally meaningful on `isDtcOnly` —
 *     `toScoringInput` silently drops it when `isDtcOnly` is true rather than
 *     rejecting a populated-but-ignored value, so this schema requires it
 *     when `isDtcOnly` is false (via `superRefine`) instead of silently
 *     accepting an inconsistent combination.
 */

import { z } from "zod";
import type { Certification } from "@prisma/client";

const CERTIFICATION_VALUES = [
  "usda_organic",
  "non_gmo",
  "gluten_free",
  "sqf",
  "brc",
] as const satisfies readonly Certification[];

export const LEAD_TIME_DAYS_MIN = 0;
export const LEAD_TIME_DAYS_MAX = 365;

export const BrandIntakeSchema = z
  .object({
    name: z.string().trim().min(1, "Brand name is required."),
    category: z.string().trim().min(1, "Category is required."),
    dtcAnnualRevenue: z
      .number()
      .min(0, "DTC annual revenue cannot be negative."),
    description: z.string().trim().optional(),

    // Margin Readiness (27%) — the gap 6.9's review flagged.
    wholesalePrice: z
      .number()
      .gt(0, "Wholesale price must be greater than $0."),
    retailPrice: z.number().gt(0, "Retail price must be greater than $0."),

    // Distributor Readiness (23%)
    hasKeheRelationship: z.boolean(),
    hasUnfiRelationship: z.boolean(),
    ediCapable: z.boolean(),
    eftCapable: z.boolean(),

    // Certification Readiness (18%)
    heldCertifications: z.array(z.enum(CERTIFICATION_VALUES)),

    // Velocity (10%)
    isDtcOnly: z.boolean(),
    unitsPerStorePerWeek: z
      .number()
      .min(0, "Units per store per week cannot be negative.")
      .optional(),

    // Fulfillment Readiness (9%)
    hasCoManufacturer: z.boolean(),
    leadTimeDays: z
      .number()
      .int("Lead time must be a whole number of days.")
      .min(
        LEAD_TIME_DAYS_MIN,
        `Lead time cannot be negative (${LEAD_TIME_DAYS_MIN}-${LEAD_TIME_DAYS_MAX} days).`,
      )
      .max(
        LEAD_TIME_DAYS_MAX,
        `Lead time must be ${LEAD_TIME_DAYS_MAX} days or fewer.`,
      ),
    hasRegionalProductionCapacity: z.boolean(),

    // Which retailer this submission is being scored against.
    retailerSlug: z.string().trim().min(1, "Please select a retailer."),
  })
  .superRefine((value, ctx) => {
    if (
      !value.isDtcOnly &&
      (value.unitsPerStorePerWeek === undefined ||
        Number.isNaN(value.unitsPerStorePerWeek))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["unitsPerStorePerWeek"],
        message:
          "Enter your current units per store per week, or mark this brand as DTC-only.",
      });
    }
  });

export type BrandIntakeInput = z.input<typeof BrandIntakeSchema>;
export type BrandIntakeParsed = z.output<typeof BrandIntakeSchema>;

export interface BrandIntakeValidationResult {
  success: boolean;
  data?: BrandIntakeParsed;
  fieldErrors: Record<string, string>;
}

/** One error message per field (first issue wins) — enough for inline form
 * feedback without needing the full Zod issue array on the client. */
export function validateBrandIntake(
  input: unknown,
): BrandIntakeValidationResult {
  const result = BrandIntakeSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data, fieldErrors: {} };
  }

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    if (!(key in fieldErrors)) {
      fieldErrors[key] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}
