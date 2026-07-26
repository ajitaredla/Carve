/**
 * Task 7.2 — the 6 dimension scores + overall score, visually. A score is a
 * number 0-100; numbers use `font-mono` (Geist Mono) per the design system
 * ("legibility of scores/dollar figures takes priority over decorative
 * flourish"). Purely presentational, no client interactivity needed.
 */

import { DIMENSION_DISPLAY_INFO } from "@/lib/scoring/dimension-labels";
import type { DimensionKey } from "@/lib/scoring/types";

export interface AssessmentScores {
  overallScore: number;
  marginScore: number;
  distributorScore: number;
  certificationScore: number;
  timingScore: number;
  velocityScore: number;
  fulfillmentScore: number;
  blockerDimension: string;
}

const SCORE_FIELD_BY_DIMENSION: Record<DimensionKey, keyof AssessmentScores> =
  {
    margin: "marginScore",
    distributor: "distributorScore",
    certification: "certificationScore",
    timing: "timingScore",
    velocity: "velocityScore",
    fulfillment: "fulfillmentScore",
  };

function overallScoreHeadline(score: number): string {
  if (score >= 70) return "Strong position";
  if (score >= 40) return "Getting there";
  return "Not ready yet";
}

export function ScorePanel({ scores }: { scores: AssessmentScores }) {
  return (
    <div className="space-y-6">
      {/* The overall score is this view's one deliberate accent highlight
       * (design system: "one highlight per view, e.g. ... the score
       * number, not everywhere"). */}
      <div className="flex items-center gap-5 rounded-2xl border border-border bg-card px-6 py-5">
        <div className="flex shrink-0 flex-col items-center justify-center rounded-full border-2 border-border bg-accent px-5 py-3 text-accent-foreground">
          <span className="font-mono text-4xl leading-none font-bold tabular-nums">
            {scores.overallScore}
          </span>
          <span className="text-[0.6rem] font-medium tracking-wide uppercase">
            / 100
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Overall readiness score
          </p>
          <p className="font-display text-xl font-semibold">
            {overallScoreHeadline(scores.overallScore)}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {DIMENSION_DISPLAY_INFO.map((dimension) => {
          const value = scores[
            SCORE_FIELD_BY_DIMENSION[dimension.key]
          ] as number;
          const isBlocker = scores.blockerDimension === dimension.key;

          return (
            <div key={dimension.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  {dimension.label}
                  {isBlocker ? (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-destructive uppercase">
                      Blocker
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-sm text-muted-foreground tabular-nums">
                  {value}/100 · {dimension.weight}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${
                    isBlocker ? "bg-destructive" : "bg-foreground/70"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
