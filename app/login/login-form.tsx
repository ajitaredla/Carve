"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: LoginState = { error: null };

export function LoginForm({
  redirectTo,
  notice,
}: {
  redirectTo: string;
  notice: string | null;
}) {
  const [state, formAction, isPending] = useActionState(login, initialState);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card p-6 shadow-[6px_6px_0_var(--border)]"
    >
      <div className="space-y-1">
        <p className="font-mono text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Carve workspace
        </p>
        <h1 className="font-display text-2xl font-semibold">
          Sign in to Carve
        </h1>
        <p className="text-sm text-muted-foreground">
          Continue to your retail-readiness workspace.
        </p>
      </div>

      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New to Carve?{" "}
        <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}
