"use client";

/**
 * Task 7.2 — the single blocker statement panel, plus the generate/retry
 * interaction. Renders whichever durable state `app/(dashboard)/assessment/
 * [id]/page.tsx` resolved server-side (see that file for how `not_started`
 * vs. `needs_review` vs. `final` is reconstructed from `getLatestGeneration
 * Status`, per 7.0b/6.9's architect review), then re-renders in place after
 * a founder-triggered (re)generation using `generateBlockerStatementSafe`
 * (`actions/generation-ui.ts`) — the friendly-error-triage wrapper around
 * `generateBlockerStatement`, since that action throws on its known error
 * paths rather than returning an `error` state (6.9's architect review).
 *
 * The regenerate button disables itself while pending — the sanctioned v1
 * mitigation for concurrent duplicate generation (6.8's product ruling: "do
 * NOT build a server-side lock/dedup mechanism now").
 */

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { generateBlockerStatementSafe } from "@/actions/generation-ui";
import type { GenerationDisplayState } from "@/lib/generation-status/display-state";

export type BlockerDisplayState = GenerationDisplayState;

export function BlockerPanel({
  retailerSlug,
  initialDisplay,
  blockerDimensionLabel,
}: {
  retailerSlug: string;
  initialDisplay: BlockerDisplayState;
  blockerDimensionLabel: string;
}) {
  const [display, setDisplay] = useState<BlockerDisplayState>(initialDisplay);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateBlockerStatementSafe(retailerSlug);

      if (result.status === "final") {
        setDisplay({ kind: "final", text: result.blockerStatement });
      } else if (result.status === "needs_review") {
        setDisplay({ kind: "needs_review", discrepancy: result.discrepancy });
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          The single blocker — {blockerDimensionLabel}
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={isPending}
        >
          {isPending
            ? "Generating…"
            : display.kind === "final"
              ? "Regenerate"
              : "Generate"}
        </Button>
      </div>

      {display.kind === "final" ? (
        <p className="text-sm leading-relaxed">{display.text}</p>
      ) : display.kind === "needs_review" ? (
        <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <p className="font-medium">This result needs review.</p>
          <p>
            Carve&apos;s verifier flagged something it couldn&apos;t resolve
            automatically: {display.discrepancy}
          </p>
          <p className="text-xs text-destructive/80">
            Nothing was shown as final. Try generating again, or check back
            later.
          </p>
        </div>
      ) : display.kind === "failed" ? (
        <p className="text-sm text-muted-foreground">
          Something interrupted the last generation attempt — nothing was
          saved. Try generating again.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Your blocker statement hasn&apos;t been generated yet.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
