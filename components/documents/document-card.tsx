"use client";

/**
 * Task 7.4 — one document type's card: label/description, current display
 * state (final/needs_review/failed/not_started, per `GenerationDisplayState`
 * — the shared shape `lib/generation-status/display-state.ts` documents as
 * "reusable by task 7.4, built separately"), a Copy button when `final`, and
 * a Generate/Regenerate button. Purely presentational + the copy-to-
 * clipboard interaction — all generation state lives in the parent
 * `DocumentsBoard`, which owns the single source of truth for all 6 cards
 * (needed so the top-level "Generate all" bulk action and each card's own
 * regenerate button can update the same state without fighting each other).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DocumentType } from "@/actions/documents";
import type { GenerationDisplayState } from "@/lib/generation-status/display-state";
import {
  DOCUMENT_TYPE_DESCRIPTIONS,
  DOCUMENT_TYPE_LABELS,
} from "@/lib/documents/labels";

export function DocumentCard({
  documentType,
  display,
  error,
  isPending,
  onGenerate,
}: {
  documentType: DocumentType;
  display: GenerationDisplayState;
  error: string | null;
  isPending: boolean;
  onGenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (display.kind !== "final") return;
    try {
      await navigator.clipboard.writeText(display.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context) —
      // fail silently rather than surface a scary error for a convenience
      // action; the content is still right there to select and copy by hand.
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">
            {DOCUMENT_TYPE_LABELS[documentType]}
          </h2>
          <p className="text-sm text-muted-foreground">
            {DOCUMENT_TYPE_DESCRIPTIONS[documentType]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {display.kind === "final" ? (
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onGenerate}
            disabled={isPending}
          >
            {isPending
              ? "Generating…"
              : display.kind === "final"
                ? "Regenerate"
                : "Generate"}
          </Button>
        </div>
      </div>

      {display.kind === "final" ? (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {display.text}
        </div>
      ) : display.kind === "needs_review" ? (
        <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <p className="font-medium">This result needs review.</p>
          <p>
            Carve&apos;s verifier flagged something it couldn&apos;t resolve
            automatically: {display.discrepancy}
          </p>
          <p className="text-xs text-destructive/80">
            Nothing was shown as final. Try generating again.
          </p>
        </div>
      ) : display.kind === "failed" ? (
        <p className="text-sm text-muted-foreground">
          Something interrupted the last generation attempt — nothing was
          saved. Try generating again.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Not generated yet.</p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
