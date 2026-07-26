/**
 * Pure input/output types for the FR-02 full cost waterfall calculator.
 *
 * These shapes describe the *calculation layer* only. Nothing here talks to
 * Prisma — a later task (the Server Action in `actions/waterfall.ts`) is
 * responsible for reading `Assessment`/`Brand` inputs and mapping them onto
 * `WaterfallInput`, and for picking which subset of `WaterfallResult` gets
 * persisted onto the `CostWaterfall` row (plus `verdictStatement`, the
 * Claude-generated narrative — a later task's job, not this module's).
 *
 * ---------------------------------------------------------------------------
 * Design call: what does `retailerMarginPct` mean? (documented per the task
 * brief, the way 2.0 documented its own ambiguous calls)
 * ---------------------------------------------------------------------------
 *
 * PRD §6.1 FR-02 lists seven **inputs**: factory cost, co-packing fee,
 * freight to DC, distributor markup %, retailer margin %, chargeback
 * estimate, MSRP. It then lists an **output** that includes, among other
 * things, "retailer margin %" again. The `CostWaterfall` Prisma model has
 * exactly one `retailerMarginPct` column, so the field can't literally be
 * both a distinct input record and a distinct output record.
 *
 * Interpretation adopted here: `retailerMarginPct` is an **input** — the
 * retailer's required/target gross margin (e.g. Sprouts' 40% minimum in the
 * FR-03 example), expressed the same way `lib/scoring`'s
 * `MarginReadinessInput.retailerMinGrossMarginPct` is. It is used to derive
 * the implied wholesale price by working *backward* from MSRP (see
 * `calculator.ts`). `founderMarginPct` — conspicuously absent from FR-02's
 * input list — is the one genuinely novel, computed percentage this module
 * produces. The `CostWaterfall` row stores `retailerMarginPct` because that
 * row is the full input+output record of one waterfall run (the same way
 * `Assessment` stores both the retailer's data version and the computed
 * scores) — not because this module derives a *different* retailer margin
 * than the one it was given.
 *
 * This also explains the division of labor with `lib/scoring`'s Margin
 * Readiness dimension: that module answers "given a wholesale price I've
 * already picked, what margin does the retailer actually get, versus their
 * minimum?" (forward calculation, wholesale price is the input). This module
 * answers a different question: "given the retailer's required margin and
 * my cost-side facts, what would my wholesale price and founder margin have
 * to be?" (backward calculation, wholesale price is derived, not given).
 * They are complementary, not duplicate, calculations.
 *
 * `distributorMarkupPct` uses the standard **markup** convention (percentage
 * of *cost*: `sellPrice = cost * (1 + markupPct / 100)`), while
 * `retailerMarginPct` uses the standard **margin** convention (percentage of
 * *selling price*: `margin = (sellPrice - cost) / sellPrice`). These are
 * genuinely different formulas — conflating them is a classic CPG pricing
 * mistake, so each field's convention is called out explicitly below.
 *
 * ---------------------------------------------------------------------------
 * Design call: `chargebackEstimate` is a per-unit dollar amount, not a %.
 * ---------------------------------------------------------------------------
 *
 * The PRD spells out "distributor markup %" and "retailer margin %" with an
 * explicit "%", but lists "chargeback estimate" and the other cost fields
 * (factory cost, co-packing fee, freight to DC) without one. Treated here as
 * a per-unit dollar deduction from the founder's net proceeds — covering
 * things like short-shipment penalties, damage/defect allowances, and
 * promotional deductions that retailers/distributors charge back against
 * what the brand actually collects. It is modeled as a deduction from
 * *proceeds*, not an addition to cost-of-goods, because that is what a
 * chargeback actually is: money already priced into the nominal wholesale
 * price that the brand never actually receives.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Input: factory cost, co-packing fee, freight to DC, distributor markup %,
 * retailer margin %, chargeback estimate, MSRP (PRD §6.1 FR-02). All dollar
 * figures are **per unit**, in USD.
 */
export interface WaterfallInput {
  /** Per-unit cost to manufacture the product. */
  factoryCost: number;
  /** Per-unit co-packing/co-manufacturing fee, if applicable (0 if none). */
  coPackingFee: number;
  /** Per-unit freight cost to get the product to the distribution center. */
  freightToDc: number;
  /**
   * Distributor markup, as a **markup-on-cost** percentage (e.g. 20 for
   * 20%): `retailerCostBasis = wholesalePrice * (1 + distributorMarkupPct / 100)`.
   * Use 0 if the brand sells direct-to-retailer with no distributor tier.
   *
   * Must be >= 0 (product ruling, task 3.6 gate). A distributor's markup is
   * their fee for warehousing/logistics/financing on top of the price they
   * paid the brand — in real distributor contracts this is never negative.
   * Volume rebates and promotional discounts are real, but they reduce what
   * the brand nets (model them via `chargebackEstimate` or a lower
   * wholesale-implying `retailerMarginPct`/`msrp`), not by flipping this
   * field's sign — a negative markup would mean the distributor resells to
   * the retailer for *less* than it paid the brand, which doesn't happen.
   */
  distributorMarkupPct: number;
  /**
   * The retailer's required/target gross margin, as a **margin-on-price**
   * percentage (e.g. 40 for 40%): `retailerCostBasis = msrp * (1 - retailerMarginPct / 100)`.
   * Sourced from the retailer's stated minimum (same figure as
   * `lib/scoring`'s `MarginReadinessInput.retailerMinGrossMarginPct`).
   */
  retailerMarginPct: number;
  /**
   * Estimated per-unit dollar deduction from the founder's proceeds for
   * chargebacks (damage/defect allowances, short shipments, promotional
   * deductions, etc.). 0 if none estimated.
   */
  chargebackEstimate: number;
  /** Manufacturer's suggested retail price — the consumer-facing shelf price. */
  msrp: number;
}

// ---------------------------------------------------------------------------
// Output — step-by-step money flow
// ---------------------------------------------------------------------------

/** Stable key identifying each stage of the money flow, for UI mapping. */
export type MoneyFlowStepKey =
  | "factoryCost"
  | "coPackingFee"
  | "freightToDc"
  | "founderGrossProfit"
  | "distributorMargin"
  | "retailerMargin";

/**
 * One stage of the factory-to-consumer money flow. Each step's `amount` is
 * additive relative to the *previous* step's `runningTotal` — the full
 * `moneyFlow` array sums, bottom to top, to `msrp` (to within the per-step
 * rounding precision the calculator applies — see `calculator.ts`'s
 * `PRECISION_DECIMALS`, not exact floating-point equality). This
 * intentionally excludes `chargebackEstimate`: a chargeback is not a channel
 * markup stacked between factory cost and MSRP, it's a deduction against the
 * founder's own proceeds (see `AllInUnitEconomics` below), so folding it into
 * this additive stack would break the "sums to MSRP" invariant.
 */
export interface MoneyFlowStep {
  key: MoneyFlowStepKey;
  /** Founder-facing label for this stage. */
  label: string;
  /** Dollar amount added at this stage (can be negative — e.g. a founder
   * operating at a loss before even reaching the distributor/retailer tiers). */
  amount: number;
  /** Cumulative per-unit price after this stage is applied. */
  runningTotal: number;
}

// ---------------------------------------------------------------------------
// Output — all-in unit economics
// ---------------------------------------------------------------------------

/**
 * "All-in" because, unlike `moneyFlow`, this includes the chargeback
 * deduction — the messier, real-world number a founder actually nets per
 * unit, not just the clean channel-markup math.
 */
export interface AllInUnitEconomics {
  /** factoryCost + coPackingFee + freightToDc. */
  landedUnitCost: number;
  /** The brand's sell-in price — derived backward from MSRP, not an input. */
  wholesalePrice: number;
  /** wholesalePrice - chargebackEstimate: what the founder actually nets per unit. */
  founderNetProceedsPerUnit: number;
  /** founderNetProceedsPerUnit - landedUnitCost. */
  founderGrossProfitPerUnit: number;
  /** retailerCostBasis - wholesalePrice: the distributor's cut, if any. */
  distributorGrossProfitPerUnit: number;
  /** Price the retailer pays to acquire the unit (post-distributor markup). */
  retailerCostBasis: number;
  /** msrp - retailerCostBasis: the retailer's per-unit gross profit. */
  retailerGrossProfitPerUnit: number;
  /** Manufacturer's suggested retail price — echoed from input for convenience. */
  msrp: number;
}

// ---------------------------------------------------------------------------
// Output — investor verdict
// ---------------------------------------------------------------------------

export type InvestorVerdict = "pass" | "marginal" | "fail";

// ---------------------------------------------------------------------------
// Output — full result
// ---------------------------------------------------------------------------

/**
 * Full waterfall calculation output. `founderMarginPct`, `retailerMarginPct`
 * (echoed input, see file header), and `investorVerdict` are the three
 * fields that map 1:1 onto the `CostWaterfall` Prisma columns of the same
 * name (`verdictStatement`, the AI-generated narrative, is a later task's
 * job and deliberately not produced here). `moneyFlow` and `economics` are
 * richer than any single `CostWaterfall` column — they're fully derivable
 * from the seven inputs, so a later persistence task can choose to store
 * them (e.g. as JSON) or simply recompute them on read.
 */
export interface WaterfallResult {
  input: WaterfallInput;
  moneyFlow: MoneyFlowStep[];
  economics: AllInUnitEconomics;
  /** Percentage, e.g. 42.5 for 42.5%. Not rounded to an integer — see calculator.ts. */
  founderMarginPct: number;
  /** Echoed from `input.retailerMarginPct` — see file header for why. */
  retailerMarginPct: number;
  investorVerdict: InvestorVerdict;
}
