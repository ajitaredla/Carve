/**
 * Task 6.0a — THE ONE shared mapping from persisted brand/retailer data onto
 * `lib/scoring/types.ts`'s `ScoringInput` (per 2.0's architect review, task
 * 2.8: this must not be built twice, once by the MCP tool layer and once by
 * a Server Action).
 *
 * ---------------------------------------------------------------------------
 * Design call #1 (RESOLVED — see update below): `toScoringInput`'s first
 * parameter is now literally Prisma's `Brand`.
 * ---------------------------------------------------------------------------
 *
 * This file originally flagged that Prisma's `Brand` model had nowhere to
 * persist the founder-entered facts scoring needs (wholesale/retail pricing,
 * distributor relationships, EDI/EFT capability, certifications held,
 * DTC-only/velocity, co-manufacturer/lead-time/regional-capacity) and took a
 * `BrandScoringFacts` parameter instead of `Brand` to avoid unilaterally
 * bolting undocumented columns onto an already-validated schema.
 *
 * That gap has since been resolved: `Brand` now carries all of these fields
 * directly (see `prisma/schema.prisma` — added alongside this task, since it
 * blocks both this mapper and task 7.1's intake form from having anywhere to
 * read from/write to). `toScoringInput` now takes Prisma's `Brand` type
 * directly; `BrandScoringFacts` is retained only as a `Pick<Brand, ...>` type
 * alias so the exact field list this function depends on stays visible at a
 * glance, rather than being lost in `Brand`'s full column list.
 *
 * ---------------------------------------------------------------------------
 * Design call #2: the expected `Retailer.requirements` JSON shape
 * ---------------------------------------------------------------------------
 *
 * `Retailer.requirements` is a Prisma `Json` column with no shape defined
 * anywhere in the codebase (no retailer-ingestion task exists yet — see 4.8's
 * product review, which logged the same gap for a different reason:
 * `Retailer.requirements` also has no history/versioning table). This file
 * defines that shape (`RetailerRequirementsSchema` below) and validates every
 * read against it with Zod.
 *
 * Only three of the six scoring dimensions actually need retailer-side facts
 * — margin (`retailerMinGrossMarginPct`), certification
 * (`requiredCertifications`), and timing (`submissionWindowOpen` /
 * `daysUntilNextWindow`). The other three (distributor, velocity,
 * fulfillment) are entirely brand-side per `lib/scoring/types.ts`'s already-
 * built, already-reviewed input types — `dimensions.ts` scores them against
 * fixed, retailer-agnostic constants (e.g. `LEAD_TIME_MAX_DAYS`,
 * `VELOCITY_BENCHMARK_MIN_UPSPW`), not a per-retailer override. So the three
 * *required* (validated, no silent defaulting) fields below are exactly
 * those three; everything else in the shape (`distributorOptions`,
 * `velocityBenchmarkUpspw`, `fulfillmentRequirements`, `programName`,
 * `notes`) is realistic retailer-onboarding data that isn't consumed by
 * scoring today but IS the kind of raw fact `get_verification_facts`'s
 * sibling tool `get_retailer_requirements` (lib/mcp/tools.ts) hands to the
 * generator/verifier agents for citation — e.g. the verifier's system prompt
 * explicitly expects to check "a distributor requirement" and "a submission
 * deadline" against this same JSON blob. Those extra fields are therefore
 * modeled as optional/passthrough, not required, and not `.strict()` at the
 * top level — an evolving, retailer-authored JSON blob rejecting on unknown
 * keys would be actively hostile to whatever ingests it next.
 *
 * Per this task's explicit instruction: missing or malformed *required*
 * fields throw a structured `ScoringInputMappingError`, they are never
 * silently defaulted. A retailer whose requirements are missing
 * `requiredCertifications` is not the same thing as a retailer that requires
 * zero certifications — defaulting the former to the latter would produce a
 * misleadingly confident certification score.
 */

import { z } from "zod";
import type { Brand, Retailer } from "@prisma/client";
import {
  scoreDimensions,
  scoreMarginReadiness,
} from "./dimensions";
import type {
  CertificationType,
  DimensionScores,
  ScoringInput,
} from "./types";

// ---------------------------------------------------------------------------
// BrandScoringFacts — see design call #1 above. Now a `Pick` of Prisma's
// real `Brand`, kept as a named alias purely so the exact fields this module
// depends on are visible without cross-referencing the full schema.
// ---------------------------------------------------------------------------

export type BrandScoringFacts = Pick<
  Brand,
  | "id"
  | "name"
  | "category"
  | "wholesalePrice"
  | "retailPrice"
  | "hasKeheRelationship"
  | "hasUnfiRelationship"
  | "ediCapable"
  | "eftCapable"
  | "heldCertifications"
  | "isDtcOnly"
  | "unitsPerStorePerWeek"
  | "hasCoManufacturer"
  | "leadTimeDays"
  | "hasRegionalProductionCapacity"
>;

// ---------------------------------------------------------------------------
// Retailer.requirements — expected JSON shape (design call #2 above).
// ---------------------------------------------------------------------------

const CERTIFICATION_TYPES = [
  "usda_organic",
  "non_gmo",
  "gluten_free",
  "sqf",
  "brc",
] as const satisfies readonly CertificationType[];

const CertificationTypeSchema = z.enum(CERTIFICATION_TYPES);

const SubmissionWindowSchema = z.object({
  open: z.boolean(),
  /** `null` when the next reset-cycle date is not yet known — see `TimingInput`. */
  daysUntilNextWindow: z.number().int().min(0).nullable(),
});

/**
 * The expected shape of `Retailer.requirements`. Only `minGrossMarginPct`,
 * `requiredCertifications`, and `submissionWindow` are consumed by
 * `toScoringInput` today (see file header for why); the rest are realistic
 * retailer-onboarding fields retained for agent-facing fact citation
 * (`get_retailer_requirements`) and future dimension refinement. Not
 * `.strict()` — unknown keys are stripped, not rejected, since this is a
 * loosely-typed, retailer-authored blob with no ingestion pipeline yet.
 */
export const RetailerRequirementsSchema = z.object({
  /** The retailer's minimum required gross margin, as a percentage (e.g. 40 for 40%). */
  minGrossMarginPct: z.number().min(0).max(100),
  /** May be empty (a retailer that requires no certifications) but must be present. */
  requiredCertifications: z.array(CertificationTypeSchema),
  submissionWindow: SubmissionWindowSchema,

  // Not consumed by scoring today (see file header) — retained for agent
  // citation and future dimension refinement. All optional: a retailer
  // requirements blob that omits them is not malformed, just less detailed.
  /** Distributors this retailer accepts, e.g. `["KeHE", "UNFI"]`. */
  distributorOptions: z.array(z.string()).optional(),
  /** Retailer-stated units-per-store-per-week benchmark, if published. */
  velocityBenchmarkUpspw: z.number().min(0).optional(),
  fulfillmentRequirements: z
    .object({
      maxLeadTimeDays: z.number().int().min(0).optional(),
      requiresCoManufacturer: z.boolean().optional(),
      requiresRegionalCapacity: z.boolean().optional(),
    })
    .optional(),
  /** e.g. "KeHE New Item Program" — for agent-facing citations, not scoring. */
  programName: z.string().optional(),
  notes: z.string().optional(),
});

export type RetailerRequirements = z.infer<typeof RetailerRequirementsSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** One Zod validation issue, decoupled from zod's own (versioned) issue type. */
export interface StructuredValidationIssue {
  path: Array<string | number>;
  message: string;
}

/**
 * Thrown by `toScoringInput` (invalid `Retailer.requirements` JSON) and by
 * `scoreDimensionsSafe` (the known `scoreMarginReadiness` throw on
 * `retailPrice <= 0`, per this task's explicit instruction to wrap that call
 * site). A typed subclass — mirroring `lib/waterfall/calculator.ts`'s
 * `WaterfallInputError` — so callers can branch on `instanceof` instead of
 * string-matching `error.message`, and so a Server Action can turn this into
 * a structured validation error response instead of an unhandled 500.
 */
export class ScoringInputMappingError extends Error {
  readonly issues: readonly StructuredValidationIssue[];

  constructor(message: string, issues: readonly StructuredValidationIssue[] = []) {
    super(message);
    this.name = "ScoringInputMappingError";
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// retailerDataVersion — sibling helper (per this task's note: "as part of
// this function's return or a sibling helper"). Kept separate so
// `toScoringInput`'s return type stays exactly `ScoringInput`, matching the
// signature given in the task brief.
// ---------------------------------------------------------------------------

/**
 * Stamp for "which snapshot of this retailer's requirements produced this
 * score" — written onto both `Assessment.retailerDataVersion` and
 * `GenerationLog.retailerDataVersion` by callers of this module (task 6.2+,
 * out of scope here). `Retailer.updatedAt` is a Prisma `@updatedAt` column,
 * so this is stable and monotonic for a given retailer row.
 */
export function getRetailerDataVersion(
  retailer: Pick<Retailer, "updatedAt">,
): string {
  return retailer.updatedAt.toISOString();
}

// ---------------------------------------------------------------------------
// Retailer.requirements parsing
// ---------------------------------------------------------------------------

/**
 * Validates and parses `retailer.requirements`. Exported separately from
 * `toScoringInput` so callers that only need the raw retailer facts (e.g. a
 * future MCP tool wanting typed access instead of `z.unknown()`) don't have
 * to go through the brand-scoring path to get them.
 */
export function parseRetailerRequirements(
  retailer: Pick<Retailer, "id" | "slug" | "requirements">,
): RetailerRequirements {
  const result = RetailerRequirementsSchema.safeParse(retailer.requirements);

  if (!result.success) {
    const issues: StructuredValidationIssue[] = result.error.issues.map(
      (issue) => ({
        path: issue.path as Array<string | number>,
        message: issue.message,
      }),
    );
    const issueSummary = issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");

    throw new ScoringInputMappingError(
      `Retailer "${retailer.slug}" (${retailer.id}) has a requirements JSON ` +
        `blob that doesn't match the expected shape (${issueSummary}). ` +
        "Refusing to score against a partially-understood requirements " +
        "blob — a missing or malformed field here would silently produce a " +
        "misleadingly confident score, not a merely incomplete one.",
      issues,
    );
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// toScoringInput — the one shared mapping.
// ---------------------------------------------------------------------------

/**
 * Maps a brand's current scoring facts and a retailer's (validated)
 * requirements onto `ScoringInput` — the ONE place this mapping happens (per
 * 2.0's architect review). Throws `ScoringInputMappingError` if
 * `retailer.requirements` doesn't match the expected shape.
 */
export function toScoringInput(
  brand: BrandScoringFacts,
  retailer: Retailer,
): ScoringInput {
  const requirements = parseRetailerRequirements(retailer);

  return {
    margin: {
      wholesalePrice: brand.wholesalePrice.toNumber(),
      retailPrice: brand.retailPrice.toNumber(),
      retailerMinGrossMarginPct: requirements.minGrossMarginPct,
    },
    distributor: {
      hasKeheRelationship: brand.hasKeheRelationship,
      hasUnfiRelationship: brand.hasUnfiRelationship,
      ediCapable: brand.ediCapable,
      eftCapable: brand.eftCapable,
    },
    certification: {
      requiredCertifications: requirements.requiredCertifications,
      // Prisma's `Certification` enum members are the same literal strings
      // as lib/scoring/types.ts's `CertificationType` union by construction
      // (see prisma/schema.prisma's Certification enum comment) — safe to
      // pass through directly rather than re-validating a value Prisma's
      // own enum type already constrains.
      heldCertifications: brand.heldCertifications,
    },
    timing: {
      submissionWindowOpen: requirements.submissionWindow.open,
      daysUntilNextWindow: requirements.submissionWindow.daysUntilNextWindow,
    },
    velocity: {
      isDtcOnly: brand.isDtcOnly,
      unitsPerStorePerWeek: brand.unitsPerStorePerWeek?.toNumber(),
    },
    fulfillment: {
      hasCoManufacturer: brand.hasCoManufacturer,
      leadTimeDays: brand.leadTimeDays,
      hasRegionalProductionCapacity: brand.hasRegionalProductionCapacity,
    },
  };
}

// ---------------------------------------------------------------------------
// scoreDimensionsSafe — wraps the known scoreMarginReadiness/scoreDimensions
// throw (per this task's explicit instruction).
// ---------------------------------------------------------------------------

/**
 * `scoreDimensions` (and the `scoreMarginReadiness` dimension it calls
 * internally) throws a plain `Error` when `input.margin.retailPrice <= 0` —
 * see `lib/scoring/dimensions.ts`. That's fine as an internal invariant
 * check, but a caller one layer up (the Server Action that creates an
 * `Assessment`) should not have that surface as an unhandled 500. This
 * wrapper converts it into the same structured `ScoringInputMappingError`
 * every other validation failure in this module produces, so callers only
 * need one `instanceof` check.
 */
export function scoreDimensionsSafe(input: ScoringInput): DimensionScores {
  try {
    return scoreDimensions(input);
  } catch (error) {
    if (error instanceof ScoringInputMappingError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ScoringInputMappingError(
      `Could not score dimensions from the mapped ScoringInput: ${message}`,
    );
  }
}

/** Re-exported for symmetry — `scoreMarginReadiness` alone, wrapped the same way. */
export function scoreMarginReadinessSafe(
  input: ScoringInput["margin"],
): ReturnType<typeof scoreMarginReadiness> {
  try {
    return scoreMarginReadiness(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ScoringInputMappingError(
      `Could not score margin readiness from the mapped ScoringInput: ${message}`,
    );
  }
}
