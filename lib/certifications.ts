/**
 * Task 7.1 — snake_case-to-display-label map for `Certification` (per 6.9's
 * architect review: "`heldCertifications: Certification[]` needs a
 * hand-built snake_case-to-display-label map — no such helper exists yet").
 *
 * `Certification` (Prisma's enum) and `CertificationType`
 * (`lib/scoring/types.ts`'s string union) are the same literal strings by
 * construction (see `prisma/schema.prisma`'s `Certification` enum comment) —
 * this map works for either.
 */

import type { Certification } from "@prisma/client";

export const CERTIFICATION_LABELS: Record<Certification, string> = {
  usda_organic: "USDA Organic",
  non_gmo: "Non-GMO",
  gluten_free: "Gluten-Free",
  sqf: "SQF",
  brc: "BRC",
};

/** Explanatory hints for the two acronym-only certs (per 7.8's product
 * review: a first-time founder shouldn't have to leave Carve to look these
 * up) — mirrors the EDI/EFT hint pattern already established in
 * `components/assessment/intake-form.tsx`. The other three labels are
 * already self-explanatory English phrases and don't need one. */
export const CERTIFICATION_HINTS: Partial<Record<Certification, string>> = {
  sqf: "Safe Quality Food — a food safety certification many retailers require before stocking a brand.",
  brc: "British Retail Consortium — another widely-recognized food safety certification, often accepted alongside or instead of SQF.",
};

/** Stable, deliberate display order — not alphabetical (matches how the PRD
 * glossary itself lists them: USDA Organic, Non-GMO, Gluten-Free, then the
 * two food-safety certs SQF/BRC as a pair). */
export const CERTIFICATION_ORDER: readonly Certification[] = [
  "usda_organic",
  "non_gmo",
  "gluten_free",
  "sqf",
  "brc",
];

export const CERTIFICATION_OPTIONS: ReadonlyArray<{
  value: Certification;
  label: string;
  hint?: string;
}> = CERTIFICATION_ORDER.map((value) => ({
  value,
  label: CERTIFICATION_LABELS[value],
  hint: CERTIFICATION_HINTS[value],
}));
