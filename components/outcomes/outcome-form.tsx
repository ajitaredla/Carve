"use client";

/**
 * Task 7.6 — "Log My Result" form (US-15, FR-07). Status selector
 * (won/rejected/pending) + optional notes, submits directly to `logOutcome`
 * (`actions/outcomes.ts`, already `"use server"`) — same convention as
 * importing a server action straight into a client component that 7.2/7.3's
 * `*Safe` wrappers use one layer up, except `logOutcome` needs no
 * generation-error triage of its own: it's a plain, deterministic Prisma
 * write with no AI call in the path, and its own thrown messages ("Invalid
 * outcome status…", "No retailer found…", "Assessment does not belong to
 * the current brand…") are already first-party, structured, and safe to
 * show directly — the same class of already-safe message `lib/errors/
 * friendly.ts` allow-lists `ScoringInputMappingError`/`WaterfallInputError`
 * through unchanged, just without a dedicated error class here since this
 * action has no AI-session failure mode to triage against.
 *
 * `assessmentId` is passed in from the parent page EXPLICITLY (this route is
 * already scoped to one specific assessment) rather than relying on
 * `logOutcome`'s own brand+retailer auto-resolution fallback — per this
 * task's brief, since the caller already has the real id in hand.
 */

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logOutcome, type OutcomeStatus } from "@/actions/outcomes";

const STATUS_OPTIONS: ReadonlyArray<{ value: OutcomeStatus; label: string }> = [
  { value: "won", label: "Won — got the PO" },
  { value: "pending", label: "Pending — still in review" },
  { value: "rejected", label: "Rejected" },
];

export function OutcomeForm({
  retailerId,
  assessmentId,
  retailerName,
}: {
  retailerId: string;
  assessmentId: string;
  retailerName: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<OutcomeStatus>("pending");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmed(false);

    startTransition(async () => {
      try {
        await logOutcome({
          retailerId,
          assessmentId,
          status,
          notes: notes.trim() || undefined,
        });
        setConfirmed(true);
        setNotes("");
        // Re-fetch the server-rendered outcome history above this form so
        // the just-logged result shows up immediately without a full reload.
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong logging this outcome. Please try again.",
        );
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
      noValidate
    >
      <div>
        <h2 className="font-display text-lg font-semibold">
          Log your result — {retailerName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Record what happened with this submission — won, rejected, or
          still pending.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as OutcomeStatus)}
        >
          <SelectTrigger id="status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth remembering — buyer feedback, next steps, timing…"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {confirmed ? (
        <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium">
          Logged — thanks for closing the loop.
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={isPending}
        className="bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {isPending ? "Logging…" : "Log outcome"}
      </Button>
    </form>
  );
}
