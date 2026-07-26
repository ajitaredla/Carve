/**
 * Task 7.6 — plain, presentational outcome history list. Deliberately not a
 * client component (no interactivity needed) — used both on the
 * per-assessment outcome page (`/assessment/[id]/outcome`) and the
 * brand-wide `/outcomes` index. `retailerName` is optional: the
 * per-assessment page already states the retailer in its own page heading,
 * while the cross-retailer index needs it per row to disambiguate.
 */

export interface OutcomeHistoryItem {
  id: string;
  status: "won" | "rejected" | "pending";
  notes: string | null;
  loggedAt: Date;
  retailerName?: string;
}

const STATUS_LABEL: Record<OutcomeHistoryItem["status"], string> = {
  won: "Won",
  rejected: "Rejected",
  pending: "Pending",
};

const STATUS_BADGE_CLASS: Record<OutcomeHistoryItem["status"], string> = {
  won: "bg-accent text-accent-foreground",
  rejected: "bg-destructive/10 text-destructive",
  pending: "bg-muted text-muted-foreground",
};

function formatLoggedAt(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function OutcomeHistory({
  outcomes,
}: {
  outcomes: OutcomeHistoryItem[];
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg font-semibold">Outcome history</h2>
      <div className="divide-y divide-border">
        {outcomes.map((outcome) => (
          <div
            key={outcome.id}
            className="space-y-1 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ${STATUS_BADGE_CLASS[outcome.status]}`}
                >
                  {STATUS_LABEL[outcome.status]}
                </span>
                {outcome.retailerName ? (
                  <span className="text-sm font-medium">
                    {outcome.retailerName}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatLoggedAt(outcome.loggedAt)}
              </span>
            </div>
            {outcome.notes ? (
              <p className="text-sm text-muted-foreground">{outcome.notes}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
