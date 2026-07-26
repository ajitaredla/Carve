import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCurrentBrand } from "@/lib/auth/current-brand";
import { getLatestGenerationStatus } from "@/lib/generation-status/get-latest-status";
import type { GenerationDisplayState } from "@/lib/generation-status/display-state";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/documents/types";
import { DocumentsBoard } from "@/components/documents/documents-board";

/**
 * Task 7.4 — Document generation views (US-05, US-06). Reachable from the
 * assessment detail view (7.2's "Documents" link).
 *
 * Per 6.1c's concurrency decision (`actions/documents.ts`'s file header),
 * `generateAllDocuments` runs all 6 FR-05 document types concurrently and
 * always resolves an array of 6 INDEPENDENT `GenerateDocumentResult`s
 * (final/needs_review/error per document, never a single blocking pass/fail
 * for the whole batch). This page and `DocumentsBoard` honor that shape —
 * each of the 6 document types renders as its own independent card/state,
 * never a monolithic "your documents are ready" toast.
 *
 * `needs_review`/`failed`/`not_started` reconstruction on a fresh page load
 * mirrors 7.2/7.3's pattern (`getLatestGenerationStatus`, per 7.0b's
 * decision), keyed by `surface = documentType` and `assessmentId` (every
 * document-type surface links by `assessmentId` only — see `GetLatest
 * GenerationStatusParams`'s own doc comment). A `GeneratedDocument` row
 * existing for a given assessmentId+documentType IS the final state, and its
 * `content` is the source of truth directly — no need to consult
 * `GenerationLog` at all in that case, mirroring `Assessment.blockerStatement`
 * / `CostWaterfall.verdictStatement`'s "a non-empty column is authoritative
 * on its own" precedent, just one row per document type here instead of one
 * column per surface.
 */
export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const brand = await requireCurrentBrand();

  const assessment = await prisma.assessment.findUnique({
    where: { id },
    include: { retailer: true },
  });

  // Ownership check (lib/auth/current-brand.ts's convention: Prisma bypasses
  // RLS, so this is the real isolation boundary) — a 404, not a 403.
  if (!assessment || assessment.brandId !== brand.id) {
    notFound();
  }

  const displays = await loadDocumentDisplayStates(assessment.id);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Brand home
          </Link>{" "}
          /{" "}
          <Link
            href={`/assessment/${assessment.id}`}
            className="hover:text-foreground"
          >
            {assessment.retailer.name}
          </Link>{" "}
          / Documents
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Documents — {assessment.retailer.name}
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Ready-to-send drafts built from your brand facts and{" "}
          {assessment.retailer.name}&apos;s own stated requirements. Review
          before sending — Carve verifies every draft, but you know your
          brand best.
        </p>
      </div>

      <DocumentsBoard assessmentId={assessment.id} initialDisplays={displays} />
    </div>
  );
}

async function loadDocumentDisplayStates(
  assessmentId: string,
): Promise<Record<DocumentType, GenerationDisplayState>> {
  const existingDocs = await prisma.generatedDocument.findMany({
    where: { assessmentId },
    select: { documentType: true, content: true },
  });
  const finalContentByType = new Map(
    existingDocs.map((doc) => [doc.documentType as DocumentType, doc.content]),
  );

  const entries = await Promise.all(
    DOCUMENT_TYPES.map(async (documentType) => {
      const finalContent = finalContentByType.get(documentType);
      if (finalContent !== undefined) {
        return [
          documentType,
          { kind: "final", text: finalContent } satisfies GenerationDisplayState,
        ] as const;
      }

      const status = await getLatestGenerationStatus(prisma, {
        surface: documentType,
        assessmentId,
      });

      let display: GenerationDisplayState;
      if (status.status === "needs_review") {
        display = { kind: "needs_review", discrepancy: status.discrepancy };
      } else if (status.status === "failed") {
        display = { kind: "failed" };
      } else {
        display = { kind: "not_started" };
      }
      return [documentType, display] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<
    DocumentType,
    GenerationDisplayState
  >;
}
