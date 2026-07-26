/**
 * Carve MCP Server — tool implementations (task 4.0, FR-01/02/05 + §10.1's
 * verification pass).
 *
 * See `.scratch/carve-v1-agentic-architecture.md` for the full design this
 * implements: Carve's AI surfaces run as Claude Managed Agents, and instead
 * of stuffing retailer/brand facts into a prompt (which a model can drift
 * from), the agent *looks up* facts through these four tools. That is the
 * structural enforcement of PRD §7's "never invents factual retailer
 * requirements" requirement.
 *
 * All four tools are read-only / pure-compute — see the parent task list:
 * writing `GenerationLog`, `Assessment.blockerStatement`,
 * `CostWaterfall.verdictStatement`, and `GeneratedDocument` rows happens in
 * the Next.js Server Action *after* a Managed Agents session goes idle
 * (task 6.0), never as a tool call here. Keeping the tool surface read-only
 * keeps "what got written to the database" fully under app control.
 *
 * ---------------------------------------------------------------------------
 * Trust boundary (read this before touching auth-adjacent code)
 * ---------------------------------------------------------------------------
 *
 * These tools do not know which founder is calling, and do not check brand
 * ownership. The route (`app/api/mcp/route.ts`) authenticates every request
 * with a single shared bearer token (task 4.6) — there is no per-founder
 * identity at this layer, by design. Brand-ownership validation (does this
 * founder actually own this `brandId`/`assessmentId`?) happens upstream, in
 * the Next.js Server Action, via `lib/auth/current-brand.ts`, *before* a
 * Managed Agents session is even created (see task 1.0's architect review
 * and task 6.0's design). Do not add founder-identity checks inside these
 * tool handlers — there is no founder identity available here to check
 * against, and trying to fake one would just create a false sense of
 * per-tenant enforcement that doesn't actually exist at this layer.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  calculateWaterfall,
  WaterfallInputError,
} from "@/lib/waterfall/calculator";
import type { InvestorVerdict } from "@/lib/waterfall/types";

const SERVER_NAME = "carve-mcp-server";
const SERVER_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A clean, structured tool error — MCP's convention (`isError: true`) rather
 * than an unhandled throw. Used for anticipated failure modes (not found,
 * invalid input, data-integrity mismatch) so the calling agent gets a
 * legible message instead of a protocol-level error. */
function toolError(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/** Success result carrying both a JSON text block (what the model reads) and
 * `structuredContent` (what a client that validates against `outputSchema`
 * can rely on) — the "modern pattern" for MCP tool responses. */
function jsonResult(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

/** Prisma `Decimal` -> plain `number`, for JSON-safe tool output. Every
 * dollar/percentage figure in the schema is stored as `Decimal` (arbitrary
 * precision) but the MCP wire format and Zod output schemas below use plain
 * numbers, matching how `lib/waterfall` and `lib/scoring` already treat
 * these values in-memory. */
function decimalToNumber(value: { toNumber(): number }): number {
  return value.toNumber();
}

/**
 * `CostWaterfall.investorVerdict` is a plain Postgres `String` column (see
 * `prisma/schema.prisma` — no enum/CHECK constraint at the DB level), not a
 * type-checked value. Reading it and blindly casting `as InvestorVerdict`
 * (the prior shape of this code) means a corrupted or unexpected row value
 * would silently flow into the verifier agent's ground-truth facts typed as
 * if it were one of the three valid verdicts — exactly the kind of unchecked
 * fact this file's whole design (§7 Accuracy: "never invents factual
 * requirements") exists to prevent. Validate at the read boundary instead,
 * the same "fail closed, don't guess" convention already used for missing
 * rows elsewhere in this file.
 */
const INVESTOR_VERDICTS = new Set<InvestorVerdict>([
  "pass",
  "marginal",
  "fail",
]);

function isInvestorVerdict(value: string): value is InvestorVerdict {
  return INVESTOR_VERDICTS.has(value as InvestorVerdict);
}

/**
 * Minimal audit trail for the two tools that resolve a caller-supplied
 * `brandId`/`assessmentId` into another tenant's data with zero ownership
 * check at this layer (see file header's trust-boundary note — that check
 * happens upstream, before a session is ever created). This route's shared
 * bearer token is the *only* thing gating access to every brand's data by
 * ID; if it ever leaks, this log is what lets the blast radius (which IDs
 * were actually read, and when) be reconstructed after the fact. Logs the
 * requested identifier only — no brand/founder PII, nothing beyond what the
 * caller itself already supplied.
 */
function logToolAccess(toolName: string, params: Record<string, string>): void {
  console.info(`[mcp:${toolName}] access`, {
    ...params,
    at: new Date().toISOString(),
  });
}

/**
 * Wraps a tool handler so any *unexpected* failure (Prisma connection/query
 * errors, etc.) becomes a sanitized, structured tool error instead of
 * leaking internals to the caller.
 *
 * Without this, the MCP SDK's own top-level catch (`McpServer`'s
 * `setToolRequestHandlers`) still turns an unhandled throw into
 * `{ isError: true, ... }` rather than crashing the request — but it does so
 * using the raw `error.message`, which for Prisma errors can include local
 * file paths and a multi-line stack-shaped message (confirmed while smoke
 * testing this route against an unreachable database). That's fine for a
 * local dev crash, not fine to hand to a Managed Agents session that then
 * might echo fragments of it into founder-facing generated text. Anticipated
 * failures (not found, bad input) should still return their own specific,
 * helpful `toolError(...)` from inside `fn` — this wrapper is only a
 * safety net for the unanticipated ones.
 */
async function safeToolCall(
  toolName: string,
  fn: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[mcp:${toolName}] unexpected error:`, error);
    return toolError(
      `Unexpected error while running ${toolName}. This has been logged ` +
        "server-side — if it persists, this needs investigation rather " +
        "than a retry.",
    );
  }
}

// ---------------------------------------------------------------------------
// Tool 1: get_retailer_requirements
// ---------------------------------------------------------------------------

const GetRetailerRequirementsInput = z
  .object({
    retailerSlug: z
      .string()
      .min(1)
      .describe(
        'The Retailer\'s unique slug (Retailer.slug), e.g. "whole-foods" or "sprouts".',
      ),
  })
  .strict();

const GetRetailerRequirementsOutput = z
  .object({
    requirements: z
      .unknown()
      .describe(
        "Retailer.requirements JSON blob — retailer-specific certification/" +
          "margin/timing/velocity/fulfillment requirements. Shape is " +
          "retailer-defined (see lib/scoring/map-retailer-requirements.ts " +
          "for how Carve's own scoring engine parses it) — do not assume a " +
          "fixed schema beyond what's actually present.",
      ),
    retailerDataVersion: z
      .string()
      .describe(
        "ISO-8601 timestamp (Retailer.updatedAt at read time). This is the " +
          "provenance convention used across Carve (see Assessment." +
          "retailerDataVersion / GenerationLog.retailerDataVersion) — stamp " +
          "this value onto anything derived from these requirements.",
      ),
  })
  .strict();

function registerGetRetailerRequirements(server: McpServer): void {
  server.registerTool(
    "get_retailer_requirements",
    {
      title: "Get Retailer Requirements",
      description:
        "Look up a retailer's stated requirements (certifications, minimum " +
        "margin, submission timing, velocity/fulfillment expectations) by " +
        "slug. Call this before writing anything that references a specific " +
        "retailer's policies, prices, or programs — never rely on prior " +
        "knowledge of a retailer's requirements, they change and this tool " +
        "is the current source of truth.\n\n" +
        "Returns: { requirements, retailerDataVersion }. Returns an error " +
        "result if no retailer exists with the given slug.",
      // Pass the full Zod object (not `.shape`) so `.strict()` is actually
      // enforced at runtime. The MCP SDK accepts either a raw shape or a
      // full schema instance (`AnySchema`) here; a raw shape gets rebuilt
      // internally via a plain (non-strict) `z.object()`, which silently
      // drops the `.strict()` unknown-key rejection this schema declares —
      // confirmed live: an extra unrecognized argument was accepted and
      // ignored rather than rejected when `.shape` was passed here.
      inputSchema: GetRetailerRequirementsInput,
      outputSchema: GetRetailerRequirementsOutput,
      annotations: {
        title: "Get Retailer Requirements",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ retailerSlug }): Promise<CallToolResult> =>
      safeToolCall("get_retailer_requirements", async () => {
        const retailer = await prisma.retailer.findUnique({
          where: { slug: retailerSlug },
        });

        if (!retailer) {
          return toolError(
            `No retailer found with slug "${retailerSlug}". Confirm the ` +
              "slug with get_brand_context or the assessment this call is " +
              "for — do not guess or invent retailer requirements when " +
              "this lookup fails.",
          );
        }

        return jsonResult({
          requirements: retailer.requirements,
          retailerDataVersion: retailer.updatedAt.toISOString(),
        });
      }),
  );
}

// ---------------------------------------------------------------------------
// Tool 2: run_waterfall_calculator
// ---------------------------------------------------------------------------

/**
 * Mirrors `WaterfallInput` (lib/waterfall/types.ts) field-for-field.
 * Deliberately does NOT re-encode the domain validation rules that
 * `calculateWaterfall`'s `validateInput()` already enforces (e.g. "retailer
 * margin must be < 100", "distributor markup can't be negative") — Zod here
 * only checks shape (numbers), so there is exactly one place those business
 * rules live. See the try/catch below for how `WaterfallInputError` surfaces
 * to the caller.
 */
const RunWaterfallCalculatorInput = z
  .object({
    factoryCost: z
      .number()
      .describe("Per-unit cost to manufacture the product, in USD."),
    coPackingFee: z
      .number()
      .describe(
        "Per-unit co-packing/co-manufacturing fee, in USD (0 if none).",
      ),
    freightToDc: z
      .number()
      .describe(
        "Per-unit freight cost to get the product to the distribution center, in USD.",
      ),
    distributorMarkupPct: z
      .number()
      .describe(
        "Distributor markup-on-cost percentage, e.g. 20 for 20% (0 for a " +
          "direct-to-retailer brand with no distributor tier). Must be >= 0.",
      ),
    retailerMarginPct: z
      .number()
      .describe(
        "The retailer's required/target margin-on-price percentage, e.g. " +
          "40 for 40%. Must be in [0, 100).",
      ),
    chargebackEstimate: z
      .number()
      .describe(
        "Estimated per-unit dollar deduction from the founder's proceeds " +
          "for chargebacks (damage/defect allowances, short shipments, " +
          "promotional deductions). 0 if none estimated.",
      ),
    msrp: z
      .number()
      .describe(
        "Manufacturer's suggested retail price — the consumer-facing shelf price, in USD.",
      ),
  })
  .strict();

const MoneyFlowStepOutput = z.object({
  key: z.enum([
    "factoryCost",
    "coPackingFee",
    "freightToDc",
    "founderGrossProfit",
    "distributorMargin",
    "retailerMargin",
  ]),
  label: z.string(),
  amount: z.number(),
  runningTotal: z.number(),
});

const RunWaterfallCalculatorOutput = z
  .object({
    moneyFlow: z
      .array(MoneyFlowStepOutput)
      .describe(
        "Additive factory-to-consumer money flow. Excludes chargebackEstimate " +
          "by design (see economics.founderNetProceedsPerUnit for the figure " +
          "that includes it) — sums to msrp.",
      ),
    economics: z.object({
      landedUnitCost: z.number(),
      wholesalePrice: z.number(),
      founderNetProceedsPerUnit: z.number(),
      founderGrossProfitPerUnit: z.number(),
      distributorGrossProfitPerUnit: z.number(),
      retailerCostBasis: z.number(),
      retailerGrossProfitPerUnit: z.number(),
      msrp: z.number(),
    }),
    founderMarginPct: z.number(),
    retailerMarginPct: z
      .number()
      .describe("Echoed from input — see lib/waterfall/types.ts for why."),
    investorVerdict: z.enum(["pass", "marginal", "fail"]),
  })
  .strict();

function registerRunWaterfallCalculator(server: McpServer): void {
  server.registerTool(
    "run_waterfall_calculator",
    {
      title: "Run Waterfall Calculator",
      description:
        "Run Carve's deterministic factory-to-shelf cost waterfall " +
        "calculation and get back the founder's margin %, full unit " +
        "economics, and pass/marginal/fail investor verdict.\n\n" +
        "IMPORTANT for verification calls: when re-confirming a waterfall " +
        "that has already been calculated and persisted (the carve-verifier " +
        "agent's job), pass the EXACT seven input values returned by " +
        "get_verification_facts for that assessment/waterfall — do not " +
        "estimate, round, or reconstruct them from the generated narrative " +
        "text. This tool recomputes from whatever inputs you give it; it " +
        "has no way to know if they match what's actually stored.\n\n" +
        "Returns a structured error (not the calculation) if the inputs are " +
        "invalid, e.g. a negative cost or a retailer margin >= 100%.",
      // Full schema instance, not `.shape` — see get_retailer_requirements'
      // registration above for why (`.strict()` is otherwise a no-op).
      inputSchema: RunWaterfallCalculatorInput,
      outputSchema: RunWaterfallCalculatorOutput,
      annotations: {
        title: "Run Waterfall Calculator",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (input): Promise<CallToolResult> =>
      safeToolCall("run_waterfall_calculator", async () => {
        try {
          const {
            moneyFlow,
            economics,
            founderMarginPct,
            retailerMarginPct,
            investorVerdict,
          } = calculateWaterfall(input);
          // `calculateWaterfall`'s result also echoes the caller's own
          // `input` back — the output schema above doesn't include it (the
          // caller already has it), so only the fields below are returned.
          return jsonResult({
            moneyFlow,
            economics,
            founderMarginPct,
            retailerMarginPct,
            investorVerdict,
          });
        } catch (error) {
          if (error instanceof WaterfallInputError) {
            return toolError(`Invalid waterfall input: ${error.message}`);
          }
          // Not a recognized validation failure — rethrow so the outer
          // safeToolCall wrapper logs it and returns a sanitized error.
          throw error;
        }
      }),
  );
}

// ---------------------------------------------------------------------------
// Tool 3: get_brand_context
// ---------------------------------------------------------------------------

const GetBrandContextInput = z
  .object({
    brandId: z
      .string()
      .min(1)
      .describe("The Brand's id (Brand.id) to fetch context for."),
  })
  .strict();

/**
 * Shared between get_brand_context and get_verification_facts — both return
 * an identically-shaped CostWaterfall block. Declared once so the two
 * tools' output schemas can't silently drift apart from each other.
 *
 * These two tools' output schemas were added after the rest of this file
 * (task 4.0's final architect review) specifically because they're the
 * highest-scrutiny tools in this surface — the ones 4.7's security review
 * added audit logging to, and the one 4.8's product review found a real
 * brandId-mismatch bug in — while being the two with the most complex,
 * nested/nullable output shapes and, until now, no runtime check that would
 * catch a future silent shape drift (a renamed Prisma field, a changed
 * `include`) before it reached an agent. `get_retailer_requirements` and
 * `run_waterfall_calculator` already had this protection; this closes the
 * gap rather than leaving it as a known-inverted risk profile.
 */
const CostWaterfallOutput = z.object({
  id: z.string(),
  factoryCost: z.number(),
  coPackingFee: z.number(),
  freightToDc: z.number(),
  distributorMarkupPct: z.number(),
  retailerMarginPct: z.number(),
  chargebackEstimate: z.number(),
  msrp: z.number(),
  founderMarginPct: z.number(),
  investorVerdict: z.enum(["pass", "marginal", "fail"]),
  verdictStatement: z.string(),
  createdAt: z.string(),
});

const GetBrandContextOutput = z
  .object({
    brand: z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      dtcAnnualRevenue: z.number(),
      description: z.string().nullable(),
    }),
    latestAssessment: z
      .object({
        id: z.string(),
        retailerId: z.string(),
        retailerSlug: z.string(),
        retailerName: z.string(),
        retailerDataVersion: z.string(),
        overallScore: z.number(),
        marginScore: z.number(),
        distributorScore: z.number(),
        certificationScore: z.number(),
        timingScore: z.number(),
        velocityScore: z.number(),
        fulfillmentScore: z.number(),
        blockerDimension: z.string(),
        blockerStatement: z.string(),
        createdAt: z.string(),
        costWaterfall: CostWaterfallOutput.nullable(),
      })
      .nullable(),
  })
  .strict();

function registerGetBrandContext(server: McpServer): void {
  server.registerTool(
    "get_brand_context",
    {
      title: "Get Brand Context",
      description:
        "Fetch a brand's profile plus its most recent assessment (scores, " +
        "blocker, and waterfall if one exists) — real facts to ground a " +
        "generation prompt in, instead of writing generic copy. Returns " +
        "`latestAssessment: null` if the brand has no assessment yet, and " +
        "`latestAssessment.costWaterfall: null` if that assessment has no " +
        "waterfall calculated yet. Returns an error result if no brand " +
        "exists with the given id.",
      // Full schema instance, not `.shape` — see get_retailer_requirements'
      // registration above for why (`.strict()` is otherwise a no-op).
      inputSchema: GetBrandContextInput,
      outputSchema: GetBrandContextOutput,
      annotations: {
        title: "Get Brand Context",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ brandId }): Promise<CallToolResult> =>
      safeToolCall("get_brand_context", async () => {
        logToolAccess("get_brand_context", { brandId });

        const brand = await prisma.brand.findUnique({
          where: { id: brandId },
          include: {
            assessments: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { retailer: true, costWaterfall: true },
            },
          },
        });

        if (!brand) {
          return toolError(`No brand found with id "${brandId}".`);
        }

        const [latest] = brand.assessments;

        if (
          latest?.costWaterfall &&
          !isInvestorVerdict(latest.costWaterfall.investorVerdict)
        ) {
          return toolError(
            `CostWaterfall "${latest.costWaterfall.id}" has an invalid ` +
              `investorVerdict value ("${latest.costWaterfall.investorVerdict}") ` +
              '— expected "pass", "marginal", or "fail". This indicates data ' +
              "corruption; do not treat this brand's waterfall verdict as " +
              "reliable until investigated.",
          );
        }

        return jsonResult({
          brand: {
            id: brand.id,
            name: brand.name,
            category: brand.category,
            dtcAnnualRevenue: decimalToNumber(brand.dtcAnnualRevenue),
            description: brand.description,
          },
          latestAssessment: latest
            ? {
                id: latest.id,
                retailerId: latest.retailerId,
                retailerSlug: latest.retailer.slug,
                retailerName: latest.retailer.name,
                retailerDataVersion: latest.retailerDataVersion,
                overallScore: latest.overallScore,
                marginScore: latest.marginScore,
                distributorScore: latest.distributorScore,
                certificationScore: latest.certificationScore,
                timingScore: latest.timingScore,
                velocityScore: latest.velocityScore,
                fulfillmentScore: latest.fulfillmentScore,
                blockerDimension: latest.blockerDimension,
                blockerStatement: latest.blockerStatement,
                createdAt: latest.createdAt.toISOString(),
                costWaterfall: latest.costWaterfall
                  ? {
                      id: latest.costWaterfall.id,
                      factoryCost: decimalToNumber(
                        latest.costWaterfall.factoryCost,
                      ),
                      coPackingFee: decimalToNumber(
                        latest.costWaterfall.coPackingFee,
                      ),
                      freightToDc: decimalToNumber(
                        latest.costWaterfall.freightToDc,
                      ),
                      distributorMarkupPct: decimalToNumber(
                        latest.costWaterfall.distributorMarkupPct,
                      ),
                      retailerMarginPct: decimalToNumber(
                        latest.costWaterfall.retailerMarginPct,
                      ),
                      chargebackEstimate: decimalToNumber(
                        latest.costWaterfall.chargebackEstimate,
                      ),
                      msrp: decimalToNumber(latest.costWaterfall.msrp),
                      founderMarginPct: decimalToNumber(
                        latest.costWaterfall.founderMarginPct,
                      ),
                      // Safe cast: validated by isInvestorVerdict() above,
                      // which returns a toolError before this point if the
                      // stored value isn't one of the three valid verdicts.
                      investorVerdict: latest.costWaterfall
                        .investorVerdict as InvestorVerdict,
                      verdictStatement: latest.costWaterfall.verdictStatement,
                      createdAt:
                        latest.costWaterfall.createdAt.toISOString(),
                    }
                  : null,
              }
            : null,
        });
      }),
  );
}

// ---------------------------------------------------------------------------
// Tool 4: get_verification_facts
// ---------------------------------------------------------------------------

const GetVerificationFactsInput = z
  .object({
    assessmentId: z
      .string()
      .min(1)
      .describe("The Assessment's id (Assessment.id) to fetch facts for."),
    brandId: z
      .string()
      .optional()
      .describe(
        "Optional Brand id — pass the brandId the calling session is " +
          "scoped to, if known, so it can be checked against this " +
          "assessment's actual brand. Mismatches are returned as an error. " +
          "This tool has no per-founder identity (see file header trust-" +
          "boundary note), so this is the only structural check available " +
          "against a session ending up with a mismatched brandId/" +
          "assessmentId pair (upstream bug, stale id copied from a prior " +
          "turn, etc.) — without it, a mismatch would silently pull a real " +
          "but wrong brand's data and generate confident, plausibly-cited " +
          "content from it. The returned assessment always includes its " +
          "actual brandId regardless of whether this param is supplied.",
      ),
    costWaterfallId: z
      .string()
      .optional()
      .describe(
        "Optional CostWaterfall id, if the caller is verifying waterfall-" +
          "specific content. When provided, it must match this assessment's " +
          "actual CostWaterfall — mismatches are returned as an error, since " +
          "that would mean the content being verified cites the wrong row.",
      ),
  })
  .strict();

const GetVerificationFactsOutput = z
  .object({
    assessment: z.object({
      id: z.string(),
      brandId: z.string(),
      retailerId: z.string(),
      retailerSlug: z.string(),
      retailerName: z.string(),
      retailerDataVersion: z.string(),
      overallScore: z.number(),
      marginScore: z.number(),
      distributorScore: z.number(),
      certificationScore: z.number(),
      timingScore: z.number(),
      velocityScore: z.number(),
      fulfillmentScore: z.number(),
      blockerDimension: z.string(),
      blockerStatement: z.string(),
      createdAt: z.string(),
    }),
    costWaterfall: CostWaterfallOutput.nullable(),
  })
  .strict();

function registerGetVerificationFacts(server: McpServer): void {
  server.registerTool(
    "get_verification_facts",
    {
      title: "Get Verification Facts",
      description:
        "Fetch the exact, persisted source-of-truth numbers for an " +
        "assessment (and its cost waterfall, if any) — the six dimension " +
        "scores, the blocker, and every stored waterfall figure.\n\n" +
        "IMPORTANT — this alone is NOT sufficient to verify content that " +
        "cites specific retailer facts (a stated minimum margin %, a " +
        "certification name, a distributor requirement, a submission " +
        "deadline). Those are normalized into 0-100 dimension scores here, " +
        "not returned as raw facts. To verify a claim like \"Whole Foods " +
        "requires 42% minimum margin,\" you must ALSO call " +
        "get_retailer_requirements(retailerSlug) — the retailerSlug is in " +
        "this tool's response — and check the claim against the raw " +
        "requirements JSON it returns.\n\n" +
        "This tool returns what's actually in the database, never a fresh " +
        "recomputation — if you need to re-run the waterfall math itself, " +
        "use run_waterfall_calculator with these exact inputs instead.\n\n" +
        "Returns an error result if no assessment exists with the given id, " +
        "if a provided brandId doesn't match this assessment's actual " +
        "brand, or if a provided costWaterfallId doesn't match this " +
        "assessment's actual CostWaterfall.",
      // Full schema instance, not `.shape` — see get_retailer_requirements'
      // registration above for why (`.strict()` is otherwise a no-op).
      inputSchema: GetVerificationFactsInput,
      outputSchema: GetVerificationFactsOutput,
      annotations: {
        title: "Get Verification Facts",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ assessmentId, brandId, costWaterfallId }): Promise<CallToolResult> =>
      safeToolCall("get_verification_facts", async () => {
        logToolAccess("get_verification_facts", {
          assessmentId,
          ...(brandId ? { brandId } : {}),
          ...(costWaterfallId ? { costWaterfallId } : {}),
        });

        const assessment = await prisma.assessment.findUnique({
          where: { id: assessmentId },
          include: { retailer: true, costWaterfall: true },
        });

        if (!assessment) {
          return toolError(`No assessment found with id "${assessmentId}".`);
        }

        if (brandId && assessment.brandId !== brandId) {
          return toolError(
            `brandId "${brandId}" does not match assessment "${assessmentId}"'s ` +
              `actual brand ("${assessment.brandId}"). Do not treat this ` +
              "assessment's facts as verification for content about a " +
              "different brand — this indicates a session/id mismatch that " +
              "needs investigation, not a retry with different arguments.",
          );
        }

        if (costWaterfallId) {
          if (!assessment.costWaterfall) {
            return toolError(
              `Assessment "${assessmentId}" has no CostWaterfall yet, but ` +
                `costWaterfallId "${costWaterfallId}" was provided. This ` +
                "assessment has no waterfall facts to verify against.",
            );
          }
          if (assessment.costWaterfall.id !== costWaterfallId) {
            return toolError(
              `costWaterfallId "${costWaterfallId}" does not match ` +
                `assessment "${assessmentId}"'s actual CostWaterfall ` +
                `("${assessment.costWaterfall.id}"). Do not treat content ` +
                "referencing the mismatched id as verified.",
            );
          }
        }

        const { costWaterfall } = assessment;

        if (costWaterfall && !isInvestorVerdict(costWaterfall.investorVerdict)) {
          return toolError(
            `CostWaterfall "${costWaterfall.id}" has an invalid ` +
              `investorVerdict value ("${costWaterfall.investorVerdict}") ` +
              '— expected "pass", "marginal", or "fail". This indicates data ' +
              "corruption; do not treat this as verified ground truth until " +
              "investigated.",
          );
        }

        return jsonResult({
          assessment: {
            id: assessment.id,
            brandId: assessment.brandId,
            retailerId: assessment.retailerId,
            retailerSlug: assessment.retailer.slug,
            retailerName: assessment.retailer.name,
            retailerDataVersion: assessment.retailerDataVersion,
            overallScore: assessment.overallScore,
            marginScore: assessment.marginScore,
            distributorScore: assessment.distributorScore,
            certificationScore: assessment.certificationScore,
            timingScore: assessment.timingScore,
            velocityScore: assessment.velocityScore,
            fulfillmentScore: assessment.fulfillmentScore,
            blockerDimension: assessment.blockerDimension,
            blockerStatement: assessment.blockerStatement,
            createdAt: assessment.createdAt.toISOString(),
          },
          costWaterfall: costWaterfall
            ? {
                id: costWaterfall.id,
                factoryCost: decimalToNumber(costWaterfall.factoryCost),
                coPackingFee: decimalToNumber(costWaterfall.coPackingFee),
                freightToDc: decimalToNumber(costWaterfall.freightToDc),
                distributorMarkupPct: decimalToNumber(
                  costWaterfall.distributorMarkupPct,
                ),
                retailerMarginPct: decimalToNumber(
                  costWaterfall.retailerMarginPct,
                ),
                chargebackEstimate: decimalToNumber(
                  costWaterfall.chargebackEstimate,
                ),
                msrp: decimalToNumber(costWaterfall.msrp),
                founderMarginPct: decimalToNumber(
                  costWaterfall.founderMarginPct,
                ),
                // Safe cast: validated by isInvestorVerdict() above, which
                // returns a toolError before this point if the stored value
                // isn't one of the three valid verdicts.
                investorVerdict:
                  costWaterfall.investorVerdict as InvestorVerdict,
                verdictStatement: costWaterfall.verdictStatement,
                createdAt: costWaterfall.createdAt.toISOString(),
              }
            : null,
        });
      }),
  );
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

/**
 * Builds a fresh `McpServer` with all four Carve tools registered. Called
 * once per incoming HTTP request by `app/api/mcp/route.ts` (stateless mode —
 * see that file for why a new server + transport per request, not a shared
 * long-lived instance, is the right shape for a Next.js Route Handler).
 */
export function createCarveMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerGetRetailerRequirements(server);
  registerRunWaterfallCalculator(server);
  registerGetBrandContext(server);
  registerGetVerificationFacts(server);

  return server;
}
