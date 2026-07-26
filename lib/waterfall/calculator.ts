/**
 * FR-02: Full Cost Waterfall Calculator.
 *
 * A pure function: typed `WaterfallInput` in, a full `WaterfallResult` out.
 * No I/O, no Prisma, no Claude calls — wiring those up (reading `Assessment`
 * inputs, persisting the result, generating `verdictStatement`) is a later
 * task's job. See `types.ts` for the documented interpretation of the
 * `retailerMarginPct` input/output ambiguity and the `chargebackEstimate`
 * dollar-vs-percent call.
 *
 * ---------------------------------------------------------------------------
 * The money-flow chain
 * ---------------------------------------------------------------------------
 *
 * All seven PRD inputs (factory cost, co-packing fee, freight to DC,
 * distributor markup %, retailer margin %, chargeback estimate, MSRP) fully
 * determine the chain — nothing is left underspecified. The chain is
 * computed *backward* from MSRP (retailer margin and distributor markup are
 * both "percentage of something downstream" conventions, so they only
 * resolve unambiguously by peeling back from the known consumer price), but
 * reported *forward* (factory to consumer), matching the PRD's own framing:
 *
 *   1. landedUnitCost      = factoryCost + coPackingFee + freightToDc
 *   2. retailerCostBasis   = msrp * (1 - retailerMarginPct / 100)
 *   3. wholesalePrice      = retailerCostBasis / (1 + distributorMarkupPct / 100)
 *   4. founderNetProceeds  = wholesalePrice - chargebackEstimate
 *   5. founderGrossProfit  = founderNetProceeds - landedUnitCost
 *   6. founderMarginPct    = founderGrossProfit / founderNetProceeds * 100
 *
 * Step 2 uses the **margin** convention (% of selling price); step 3 uses
 * the **markup** convention (% of cost) — see `types.ts` for why these are
 * deliberately not the same formula. Step 6 mirrors that same margin
 * convention (% of the founder's own "selling price", i.e. net proceeds) so
 * `founderMarginPct` and `retailerMarginPct` are directly comparable —
 * both are "gross profit as a percentage of what you actually collect."
 *
 * ---------------------------------------------------------------------------
 * Currency precision decision
 * ---------------------------------------------------------------------------
 *
 * `CostWaterfall`'s money/percentage columns are `Decimal` (arbitrary
 * precision in Postgres), not `Int` — the task brief for this module is
 * explicit: keep more precision, don't round aggressively the way the
 * `Int`-based scoring module does.
 *
 * This module still uses plain JS `number` (IEEE 754 double), not a
 * decimal/bignum library, for three reasons:
 *   1. No decimal library (e.g. `decimal.js`) is currently a project
 *      dependency (checked `package.json` / lockfile) — pulling one in for
 *      this module alone would be a build-affecting choice a later
 *      persistence task might want to make differently once it's dealing
 *      with `Prisma.Decimal` directly at the DB boundary anyway.
 *   2. The chain is short and linear (six arithmetic operations, not a loop
 *      or compounding series), so IEEE 754 error accumulates to at most a
 *      handful of ULPs — many orders of magnitude below a cent.
 *   3. `round()` below is applied after every computed step to a fixed
 *      `PRECISION_DECIMALS` (4 decimal places — sub-cent, but not
 *      infinite), which eliminates the actual practical risk (binary
 *      floating-point representation noise like `0.1 + 0.2`) without
 *      discarding precision the `Decimal` column could otherwise hold.
 *
 * If this calculator later needs to compose many more chained percentage
 * operations (e.g. multi-tier distributor stacks), revisit this call — that
 * is the point at which float error could plausibly compound into something
 * a cent-level rounding pass wouldn't catch.
 */

import type {
  AllInUnitEconomics,
  InvestorVerdict,
  MoneyFlowStep,
  WaterfallInput,
  WaterfallResult,
} from "./types";

// ---------------------------------------------------------------------------
// Rounding
// ---------------------------------------------------------------------------

/** Sub-cent precision retained on every computed dollar and percentage figure. */
const PRECISION_DECIMALS = 4;

function round(value: number): number {
  const factor = 10 ** PRECISION_DECIMALS;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown for any invalid `WaterfallInput` — both the up-front field validation
 * in `validateInput()` and the derived "computed net proceeds <= 0" guard
 * further down. A typed subclass (rather than a plain `Error`) so callers
 * (the task 4.0 MCP tool handler, and any future Server Action) can branch on
 * `instanceof WaterfallInputError` instead of string-matching `error.message`.
 */
export class WaterfallInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaterfallInputError";
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateInput(input: WaterfallInput): void {
  const {
    factoryCost,
    coPackingFee,
    freightToDc,
    distributorMarkupPct,
    retailerMarginPct,
    chargebackEstimate,
    msrp,
  } = input;

  if (factoryCost < 0) {
    throw new WaterfallInputError(
      "WaterfallInput.factoryCost cannot be negative.",
    );
  }
  if (coPackingFee < 0) {
    throw new WaterfallInputError(
      "WaterfallInput.coPackingFee cannot be negative.",
    );
  }
  if (freightToDc < 0) {
    throw new WaterfallInputError(
      "WaterfallInput.freightToDc cannot be negative.",
    );
  }
  if (chargebackEstimate < 0) {
    throw new WaterfallInputError(
      "WaterfallInput.chargebackEstimate cannot be negative.",
    );
  }
  if (msrp <= 0) {
    throw new WaterfallInputError(
      "WaterfallInput.msrp must be greater than 0.",
    );
  }
  if (retailerMarginPct < 0) {
    throw new WaterfallInputError(
      "WaterfallInput.retailerMarginPct cannot be negative (a negative margin " +
        "would push the retailer's cost basis above MSRP, which is not a valid " +
        "required/target margin).",
    );
  }
  if (retailerMarginPct >= 100) {
    throw new WaterfallInputError(
      "WaterfallInput.retailerMarginPct must be less than 100 (a retailer " +
        "cannot acquire a unit for $0 or less).",
    );
  }
  if (distributorMarkupPct < 0) {
    throw new WaterfallInputError(
      "WaterfallInput.distributorMarkupPct cannot be negative. Distributor " +
        "markup models the distributor's margin for warehousing/logistics/" +
        "financing on top of the brand's wholesale price — in food " +
        "distribution this is a fee, never a rebate stacked into the sell-in " +
        "price itself. A volume rebate or promotional discount from a " +
        "distributor is a real scenario, but it reduces the brand's net " +
        "proceeds (model it via chargebackEstimate or a lower wholesale " +
        "price), it does not invert the markup direction. Use 0 for a " +
        "direct-to-retailer brand with no distributor tier.",
    );
  }
}

// ---------------------------------------------------------------------------
// Investor verdict thresholds
// ---------------------------------------------------------------------------

/**
 * Founder margin thresholds for the investor-readiness verdict. The PRD
 * doesn't specify exact numbers (§6.1 FR-02 just calls for "pass / marginal
 * / fail"); these are informed by §2.1-2.2's O'Leary/unit-economics framing
 * ("show me the unit economics from factory to shelf" as the recurring
 * dealbreaker question) and by the FR-03 worked example, which treats a
 * *retailer's* 55% margin against their 40% minimum as clearing
 * "comfortably" — i.e. sitting exactly at a minimum is not itself a
 * comfortable pass, some cushion above the floor is expected.
 *
 * Chosen thresholds (founder gross margin, as % of net proceeds):
 *   - PASS:     >= 50%  — enough room left, after true landed cost and
 *                         chargebacks, to fund marketing/trade spend and
 *                         still be a venture-viable CPG business. This is
 *                         the commonly-cited target margin for emerging
 *                         natural/specialty CPG brands seeking investment.
 *   - MARGINAL: 30-50%  — survivable but thin: covers cost today, but a
 *                         single price increase, new chargeback, or promo
 *                         ask from a buyer could tip it into a loss. This
 *                         is exactly the O'Leary-killed-the-deal zone —
 *                         technically working, but not durable.
 *   - FAIL:     < 30%   — including negative. Insufficient margin to run
 *                         the business at all once real costs are counted;
 *                         this is the "unit economics don't work" verdict
 *                         that ends Shark Tank CPG deals regardless of how
 *                         good the product or the story is.
 *
 * These are tuning constants, not derived facts — flagged for product
 * review (task 3.6) exactly like 2.0 flagged its own margin/blocker tuning
 * constants, and expected to be adjusted there.
 */
export const FOUNDER_MARGIN_PASS_THRESHOLD_PCT = 50;
export const FOUNDER_MARGIN_MARGINAL_THRESHOLD_PCT = 30;

export function determineInvestorVerdict(
  founderMarginPct: number,
): InvestorVerdict {
  if (founderMarginPct >= FOUNDER_MARGIN_PASS_THRESHOLD_PCT) return "pass";
  if (founderMarginPct >= FOUNDER_MARGIN_MARGINAL_THRESHOLD_PCT)
    return "marginal";
  return "fail";
}

// ---------------------------------------------------------------------------
// Calculator
// ---------------------------------------------------------------------------

export function calculateWaterfall(input: WaterfallInput): WaterfallResult {
  validateInput(input);

  const {
    factoryCost,
    coPackingFee,
    freightToDc,
    distributorMarkupPct,
    retailerMarginPct,
    chargebackEstimate,
    msrp,
  } = input;

  // Step 1: landed unit cost — pure addition, no rounding risk, but round
  // anyway for consistency with every other computed figure.
  const landedUnitCost = round(factoryCost + coPackingFee + freightToDc);

  // Step 2: retailer's cost basis, working backward from MSRP using the
  // margin-on-price convention.
  const retailerCostBasis = round(msrp * (1 - retailerMarginPct / 100));

  // Step 3: brand's wholesale (sell-in) price, working backward from the
  // retailer's cost basis using the markup-on-cost convention.
  const wholesalePrice = round(
    retailerCostBasis / (1 + distributorMarkupPct / 100),
  );

  // Step 4: what the founder actually nets per unit, after chargebacks.
  const founderNetProceedsPerUnit = round(wholesalePrice - chargebackEstimate);

  if (founderNetProceedsPerUnit <= 0) {
    throw new WaterfallInputError(
      "Computed founder net proceeds per unit is zero or negative " +
        "(chargebackEstimate meets or exceeds the derived wholesale price) " +
        "— founder margin % is undefined as a percentage of proceeds in this case.",
    );
  }

  // Step 5: founder's gross profit per unit.
  const founderGrossProfitPerUnit = round(
    founderNetProceedsPerUnit - landedUnitCost,
  );

  // Step 6: founder margin, same "% of what you collect" convention as
  // retailer margin, for direct comparability.
  const founderMarginPct = round(
    (founderGrossProfitPerUnit / founderNetProceedsPerUnit) * 100,
  );

  const distributorGrossProfitPerUnit = round(
    retailerCostBasis - wholesalePrice,
  );
  const retailerGrossProfitPerUnit = round(msrp - retailerCostBasis);

  const moneyFlow: MoneyFlowStep[] = buildMoneyFlow({
    factoryCost,
    coPackingFee,
    freightToDc,
    landedUnitCost,
    wholesalePrice,
    retailerCostBasis,
    msrp,
  });

  const economics: AllInUnitEconomics = {
    landedUnitCost,
    wholesalePrice,
    founderNetProceedsPerUnit,
    founderGrossProfitPerUnit,
    distributorGrossProfitPerUnit,
    retailerCostBasis,
    retailerGrossProfitPerUnit,
    msrp,
  };

  return {
    input,
    moneyFlow,
    economics,
    founderMarginPct,
    // Echoed from input — see types.ts header for why this is not a fresh
    // derivation of a different number.
    retailerMarginPct,
    investorVerdict: determineInvestorVerdict(founderMarginPct),
  };
}

function buildMoneyFlow(steps: {
  factoryCost: number;
  coPackingFee: number;
  freightToDc: number;
  landedUnitCost: number;
  wholesalePrice: number;
  retailerCostBasis: number;
  msrp: number;
}): MoneyFlowStep[] {
  const {
    factoryCost,
    coPackingFee,
    freightToDc,
    landedUnitCost,
    wholesalePrice,
    retailerCostBasis,
    msrp,
  } = steps;

  return [
    {
      key: "factoryCost",
      label: "Factory cost",
      amount: factoryCost,
      runningTotal: round(factoryCost),
    },
    {
      key: "coPackingFee",
      label: "Co-packing fee",
      amount: coPackingFee,
      runningTotal: round(factoryCost + coPackingFee),
    },
    {
      key: "freightToDc",
      label: "Freight to DC",
      amount: freightToDc,
      runningTotal: landedUnitCost,
    },
    {
      key: "founderGrossProfit",
      label: "Founder gross margin",
      amount: round(wholesalePrice - landedUnitCost),
      runningTotal: wholesalePrice,
    },
    {
      key: "distributorMargin",
      label: "Distributor markup",
      amount: round(retailerCostBasis - wholesalePrice),
      runningTotal: retailerCostBasis,
    },
    {
      key: "retailerMargin",
      label: "Retailer margin",
      amount: round(msrp - retailerCostBasis),
      runningTotal: round(msrp),
    },
  ];
}
