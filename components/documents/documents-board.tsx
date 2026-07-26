"use client";

/**
 * Task 7.4 — the document generation board: a top-level "Generate all
 * documents" bulk action plus 6 independent `DocumentCard`s, each with its
 * own regenerate button. Renders whichever durable state `app/(dashboard)/
 * assessment/[id]/documents/page.tsx` resolved server-side (see that file
 * for how each document type's `final`/`needs_review`/`failed`/`not_started`
 * is reconstructed), then re-renders each card in place as live results
 * arrive.
 *
 * Per 6.1c's design (`actions/documents.ts`'s file header), `generateAll
 * DocumentsSafe` always resolves an array of 6 INDEPENDENT results — never a
 * single blocking pass/fail for the whole batch. This component honors that:
 * `handleGenerateAll` updates each of the 6 cards' state from its own entry
 * in that array (final -> shows content, needs_review -> shows the
 * discrepancy, error -> shows a per-card error message without touching that
 * card's durable display state), so one flagged or failed document never
 * hides the other five's results.
 *
 * `handleGenerateOne` lets a founder regenerate just one document without
 * re-running all six (`generateOneDocumentSafe`, backed by `actions/
 * documents.ts`'s existing single-document exports).
 *
 * Both the bulk button and every per-card button disable themselves while
 * pending — the sanctioned v1 mitigation for concurrent duplicate
 * generation (6.8's product ruling: "do NOT build a server-side lock/dedup
 * mechanism now"). The bulk button also disables while ANY per-card
 * regeneration is in flight, and vice versa, so a founder can't kick off two
 * overlapping generations for the same document from two different buttons.
 */

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/documents/types";
import type { GenerationDisplayState } from "@/lib/generation-status/display-state";
import {
  generateAllDocumentsSafe,
  generateOneDocumentSafe,
} from "@/actions/generation-ui";
import { DocumentCard } from "@/components/documents/document-card";

type DisplayMap = Record<DocumentType, GenerationDisplayState>;
type ErrorMap = Partial<Record<DocumentType, string>>;

function withoutKey<T extends string>(
  map: Partial<Record<T, string>>,
  key: T,
): Partial<Record<T, string>> {
  const next = { ...map };
  delete next[key];
  return next;
}

export function DocumentsBoard({
  assessmentId,
  initialDisplays,
}: {
  assessmentId: string;
  initialDisplays: DisplayMap;
}) {
  const [displays, setDisplays] = useState<DisplayMap>(initialDisplays);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [pendingTypes, setPendingTypes] = useState<Set<DocumentType>>(
    new Set(),
  );
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkPending, startBulkTransition] = useTransition();

  const anyPending = isBulkPending || pendingTypes.size > 0;

  function handleGenerateAll() {
    setBulkError(null);
    setErrors({});
    startBulkTransition(async () => {
      const result = await generateAllDocumentsSafe(assessmentId);

      if (!Array.isArray(result)) {
        // A batch-level failure (e.g. the assessment lookup/ownership check
        // inside `loadDocumentContext` threw before any per-document work
        // even started) — none of the 6 cards' durable state changes.
        setBulkError(result.message);
        return;
      }

      setDisplays((prev) => {
        const next = { ...prev };
        for (const doc of result) {
          if (doc.status === "final") {
            next[doc.documentType] = { kind: "final", text: doc.content };
          } else if (doc.status === "needs_review") {
            next[doc.documentType] = {
              kind: "needs_review",
              discrepancy: doc.discrepancy,
            };
          }
          // "error" results deliberately do NOT overwrite the durable
          // display state — see the per-card error tracked below instead.
        }
        return next;
      });

      setErrors((prev) => {
        let next = prev;
        for (const doc of result) {
          next =
            doc.status === "error"
              ? { ...next, [doc.documentType]: doc.message }
              : withoutKey(next, doc.documentType);
        }
        return next;
      });
    });
  }

  function handleGenerateOne(documentType: DocumentType) {
    setErrors((prev) => withoutKey(prev, documentType));
    setPendingTypes((prev) => new Set(prev).add(documentType));

    generateOneDocumentSafe(documentType, assessmentId)
      .then((result) => {
        if (result.status === "final") {
          setDisplays((prev) => ({
            ...prev,
            [documentType]: { kind: "final", text: result.content },
          }));
          setErrors((prev) => withoutKey(prev, documentType));
        } else if (result.status === "needs_review") {
          setDisplays((prev) => ({
            ...prev,
            [documentType]: {
              kind: "needs_review",
              discrepancy: result.discrepancy,
            },
          }));
          setErrors((prev) => withoutKey(prev, documentType));
        } else {
          setErrors((prev) => ({ ...prev, [documentType]: result.message }));
        }
      })
      .finally(() => {
        setPendingTypes((prev) => {
          const next = new Set(prev);
          next.delete(documentType);
          return next;
        });
      });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold">
            All 6 documents
          </h2>
          <p className="text-sm text-muted-foreground">
            Generate every document at once, or regenerate just one below.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleGenerateAll}
          disabled={anyPending}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {isBulkPending ? "Generating all…" : "Generate all documents"}
        </Button>
      </div>

      {bulkError ? (
        <p role="alert" className="text-sm text-destructive">
          {bulkError}
        </p>
      ) : null}

      <div className="grid gap-4">
        {DOCUMENT_TYPES.map((documentType) => (
          <DocumentCard
            key={documentType}
            documentType={documentType}
            display={displays[documentType]}
            error={errors[documentType] ?? null}
            isPending={isBulkPending || pendingTypes.has(documentType)}
            onGenerate={() => handleGenerateOne(documentType)}
          />
        ))}
      </div>
    </div>
  );
}
