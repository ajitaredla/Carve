/**
 * Task 7.4 build fix — `DOCUMENT_TYPES` (the runtime list of all 6 FR-05
 * document type literals) and the `DocumentType` type it derives were
 * originally defined directly in `actions/documents.ts`. `next build`
 * confirmed that's invalid: `actions/documents.ts` is a `"use server"` file,
 * and every export of such a file must be an async function — a plain
 * runtime array constant fails with "A 'use server' file can only export
 * async functions, found object." This only surfaced once task 7.4's UI
 * (`app/(dashboard)/assessment/[id]/documents/page.tsx`,
 * `components/documents/documents-board.tsx`) started importing
 * `DOCUMENT_TYPES` directly — no prior caller (task 6.4's own tests import
 * via vitest, which doesn't apply Next's "use server" export-shape
 * transform) had exercised this path through `next build`.
 *
 * Moved here so both `actions/documents.ts` (the Server Actions) and any
 * server/client UI code can import the same canonical list without
 * violating that constraint. `actions/documents.ts` imports `DOCUMENT_TYPES`
 * from here for its own internal use (`generateAllDocuments`) but does not
 * re-export the runtime array — only its `DocumentType` TYPE (erased at
 * compile time, not a runtime export, so it's exempt from the same rule).
 * UI code should import `DOCUMENT_TYPES` from here directly, not from
 * `@/actions/documents`.
 */

import type { GenerationSurface } from "@/lib/agents/generate";

export const DOCUMENT_TYPES = [
  "kehe_application",
  "sprouts_checklist",
  "wf_pitch_brief",
  "sell_sheet_outline",
  "unfi_application",
  "buyer_outreach_email",
] as const satisfies readonly GenerationSurface[];

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
