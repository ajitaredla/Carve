/**
 * Task 7.2 — founder-facing display labels for `DimensionKey` (FR-01's six
 * scoring dimensions), plus their PRD-stated weights, kept separate from
 * `lib/scoring/types.ts` since that file is the calculation layer's own
 * vocabulary (short, internal `reason` strings), not UI copy.
 */

import { DIMENSION_ORDER, DIMENSION_WEIGHTS, type DimensionKey } from "./types";

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  margin: "Margin Readiness",
  distributor: "Distributor Readiness",
  certification: "Certification Readiness",
  timing: "Timing",
  velocity: "Velocity",
  fulfillment: "Fulfillment Readiness",
};

export const DIMENSION_DISPLAY_ORDER: readonly DimensionKey[] = DIMENSION_ORDER;

export interface DimensionDisplayInfo {
  key: DimensionKey;
  label: string;
  weight: number;
}

export const DIMENSION_DISPLAY_INFO: readonly DimensionDisplayInfo[] =
  DIMENSION_ORDER.map((key) => ({
    key,
    label: DIMENSION_LABELS[key],
    weight: DIMENSION_WEIGHTS[key],
  }));
