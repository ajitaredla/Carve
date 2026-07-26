/**
 * Task 7.3 — waterfall results: step-by-step money flow, all-in unit
 * economics, investor verdict, and the AI-generated verdict statement.
 * Purely presentational — `app/(dashboard)/assessment/[id]/waterfall/
 * page.tsx` always recomputes `WaterfallResult` fresh from the persisted
 * scalars via `calculateWaterfall()` (recompute-on-read, the documented
 * intended design — `CostWaterfall` has no `moneyFlow`/`economics` columns)
 * and passes it straight through here.
 *
 * Per 3.5's QC flag, explicitly labeled here: `moneyFlow`'s "Founder gross
 * margin" step EXCLUDES `chargebackEstimate`, while `economics.
 * founderGrossProfitPerUnit` (in "All-in unit economics") INCLUDES it. Both
 * are shown, both are captioned, so a founder never sees two contradictory
 * "profit" numbers without knowing why they differ.
 */

import type { InvestorVerdict, WaterfallResult } from "@/lib/waterfall/types";
import {
  FOUNDER_MARGIN_MARGINAL_THRESHOLD_PCT,
  FOUNDER_MARGIN_PASS_THRESHOLD_PCT,
} from "@/lib/waterfall/calculator";
import type { GenerationDisplayState } from "@/lib/generation-status/display-state";

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const VERDICT_COPY: Record<
  InvestorVerdict,
  { label: string; className: string }
> = {
  pass: {
    label: "Pass",
    className: "bg-accent text-accent-foreground",
  },
  marginal: {
    label: "Marginal",
    className: "bg-muted text-foreground",
  },
  fail: {
    label: "Fail",
    className: "bg-destructive/10 text-destructive",
  },
};

export function WaterfallResults({
  result,
  verdictDisplay,
}: {
  result: WaterfallResult;
  verdictDisplay: GenerationDisplayState;
}) {
  const verdictCopy = VERDICT_COPY[result.investorVerdict];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-card px-6 py-5">
        <div
          className={`flex shrink-0 flex-col items-center justify-center rounded-full border-2 border-border px-5 py-3 ${verdictCopy.className}`}
        >
          <span className="font-mono text-3xl leading-none font-bold tabular-nums">
            {result.founderMarginPct.toFixed(1)}%
          </span>
          <span className="text-[0.6rem] font-medium tracking-wide uppercase">
            founder margin
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Investor readiness verdict
          </p>
          <p className="font-display text-xl font-semibold">
            {verdictCopy.label}
          </p>
          <p className="text-xs text-muted-foreground">
            Pass ≥ {FOUNDER_MARGIN_PASS_THRESHOLD_PCT}% · Marginal ≥{" "}
            {FOUNDER_MARGIN_MARGINAL_THRESHOLD_PCT}% · Fail below{" "}
            {FOUNDER_MARGIN_MARGINAL_THRESHOLD_PCT}%
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">
          Money flow — factory to consumer
        </h2>
        <p className="text-xs text-muted-foreground">
          Excludes the chargeback deduction (see &ldquo;All-in unit
          economics&rdquo; below for the number that includes it).
        </p>
        <div className="divide-y divide-border">
          {result.moneyFlow.map((step) => (
            <div
              key={step.key}
              className="flex items-center justify-between gap-4 py-2 text-sm"
            >
              <span>
                {step.label}
                {step.key === "founderGrossProfit" ? (
                  <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                    before chargebacks
                  </span>
                ) : null}
              </span>
              <span className="flex items-baseline gap-4 font-mono tabular-nums">
                <span
                  className={
                    step.amount < 0 ? "text-destructive" : "text-muted-foreground"
                  }
                >
                  {step.amount >= 0 ? "+" : ""}
                  {formatUsd(step.amount)}
                </span>
                <span className="w-24 text-right font-semibold">
                  {formatUsd(step.runningTotal)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">
          All-in unit economics
        </h2>
        <p className="text-xs text-muted-foreground">
          Includes the chargeback deduction — this is the more real-world
          number.
        </p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <EconRow label="Landed unit cost" value={result.economics.landedUnitCost} />
          <EconRow label="Wholesale price" value={result.economics.wholesalePrice} />
          <EconRow
            label="Founder net proceeds / unit"
            value={result.economics.founderNetProceedsPerUnit}
          />
          <EconRow
            label="Founder gross profit / unit"
            value={result.economics.founderGrossProfitPerUnit}
            highlight
            hint="includes chargebacks"
          />
          <EconRow
            label="Distributor gross profit / unit"
            value={result.economics.distributorGrossProfitPerUnit}
          />
          <EconRow label="Retailer cost basis" value={result.economics.retailerCostBasis} />
          <EconRow
            label="Retailer gross profit / unit"
            value={result.economics.retailerGrossProfitPerUnit}
          />
          <EconRow label="MSRP" value={result.economics.msrp} />
        </dl>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">
          Investor verdict statement
        </h2>
        {verdictDisplay.kind === "final" ? (
          <p className="text-sm leading-relaxed">{verdictDisplay.text}</p>
        ) : verdictDisplay.kind === "needs_review" ? (
          <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <p className="font-medium">This result needs review.</p>
            <p>
              Carve&apos;s verifier flagged something it couldn&apos;t
              resolve automatically: {verdictDisplay.discrepancy}
            </p>
            <p className="text-xs text-destructive/80">
              Nothing was shown as final — try generating again below.
            </p>
          </div>
        ) : verdictDisplay.kind === "failed" ? (
          <p className="text-sm text-muted-foreground">
            Something interrupted the last generation attempt — nothing was
            saved. Try generating again below.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run the calculator below to generate a verdict statement.
          </p>
        )}
      </div>
    </div>
  );
}

function EconRow({
  label,
  value,
  highlight,
  hint,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <dt className="text-muted-foreground">
        {label}
        {hint ? (
          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </dt>
      <dd
        className={`font-mono tabular-nums ${highlight ? "font-semibold text-foreground" : ""}`}
      >
        {formatUsd(value)}
      </dd>
    </div>
  );
}
