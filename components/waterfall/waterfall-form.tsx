"use client";

/**
 * Task 7.3 — the 6 founder-entered waterfall inputs (factoryCost,
 * coPackingFee, freightToDc, distributorMarkupPct, chargebackEstimate,
 * msrp). `retailerMarginPct` is deliberately NOT a field here — per
 * `actions/waterfall.ts`'s own design, it's derived server-side from the
 * retailer's requirements, never founder-entered.
 *
 * On submit, calls `generateWaterfallVerdictSafe` (`actions/generation-
 * ui.ts` — the same friendly-error-triage wrapper pattern `components/
 * assessment/blocker-panel.tsx` uses, since `generateWaterfallVerdict`
 * throws on its known error paths rather than returning an `error` state).
 * The persisted `CostWaterfall` scalars change on every outcome except a
 * pure `WaterfallInputError` (whose whole transaction rolls back — see
 * `actions/waterfall.ts`'s 6.6a header), so this component always calls
 * `router.refresh()` after a result comes back: the parent Server Component
 * page re-fetches and recomputes `WaterfallResult` fresh (recompute-on-read,
 * the documented intended design), which is the single source of truth for
 * `components/waterfall/waterfall-results.tsx`'s numbers — this form never
 * tries to locally recompute or duplicate that logic.
 */

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateWaterfallVerdictSafe } from "@/actions/generation-ui";

export interface WaterfallFormInitialValues {
  factoryCost: number;
  coPackingFee: number;
  freightToDc: number;
  distributorMarkupPct: number;
  chargebackEstimate: number;
  msrp: number;
}

const EMPTY_VALUES: WaterfallFormInitialValues = {
  factoryCost: 0,
  coPackingFee: 0,
  freightToDc: 0,
  distributorMarkupPct: 0,
  chargebackEstimate: 0,
  msrp: 0,
};

function numberField(value: number): string {
  return value ? String(value) : "";
}

export function WaterfallForm({
  retailerSlug,
  initialValues,
  hasExistingResult,
}: {
  retailerSlug: string;
  initialValues: WaterfallFormInitialValues | null;
  hasExistingResult: boolean;
}) {
  const router = useRouter();
  const base = initialValues ?? EMPTY_VALUES;

  const [factoryCost, setFactoryCost] = useState(numberField(base.factoryCost));
  const [coPackingFee, setCoPackingFee] = useState(
    numberField(base.coPackingFee),
  );
  const [freightToDc, setFreightToDc] = useState(
    numberField(base.freightToDc),
  );
  const [distributorMarkupPct, setDistributorMarkupPct] = useState(
    numberField(base.distributorMarkupPct),
  );
  const [chargebackEstimate, setChargebackEstimate] = useState(
    numberField(base.chargebackEstimate),
  );
  const [msrp, setMsrp] = useState(numberField(base.msrp));

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await generateWaterfallVerdictSafe({
        retailerSlug,
        factoryCost: Number(factoryCost),
        coPackingFee: Number(coPackingFee),
        freightToDc: Number(freightToDc),
        distributorMarkupPct: Number(distributorMarkupPct),
        chargebackEstimate: Number(chargebackEstimate),
        msrp: Number(msrp),
      });

      if (result.status === "error") {
        setError(result.message);
        return;
      }

      // Scalars are persisted regardless of final/needs_review — re-fetch
      // and recompute server-side (see file header).
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
      noValidate
    >
      <h2 className="font-display text-lg font-semibold">
        Cost waterfall inputs
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="factoryCost">Factory cost (per unit)</Label>
          <Input
            id="factoryCost"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="font-mono"
            value={factoryCost}
            onChange={(e) => setFactoryCost(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coPackingFee">Co-packing fee (per unit)</Label>
          <Input
            id="coPackingFee"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="font-mono"
            value={coPackingFee}
            onChange={(e) => setCoPackingFee(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="freightToDc">Freight to DC (per unit)</Label>
          <Input
            id="freightToDc"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="font-mono"
            value={freightToDc}
            onChange={(e) => setFreightToDc(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="distributorMarkupPct">
            Distributor markup (%)
          </Label>
          <Input
            id="distributorMarkupPct"
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            className="font-mono"
            value={distributorMarkupPct}
            onChange={(e) => setDistributorMarkupPct(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Use 0 for direct-to-retailer, no distributor tier.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chargebackEstimate">
            Chargeback estimate (per unit)
          </Label>
          <Input
            id="chargebackEstimate"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="font-mono"
            value={chargebackEstimate}
            onChange={(e) => setChargebackEstimate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="msrp">MSRP</Label>
          <Input
            id="msrp"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            className="font-mono"
            value={msrp}
            onChange={(e) => setMsrp(e.target.value)}
            required
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Retailer margin % is not entered here — Carve derives it from{" "}
        {retailerSlug}&apos;s own stated requirements.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isPending}
        className="bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {isPending
          ? "Calculating…"
          : hasExistingResult
            ? "Recalculate & regenerate verdict"
            : "Calculate & generate verdict"}
      </Button>
    </form>
  );
}
