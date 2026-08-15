"use client";

import Link from "next/link";
import { useState } from "react";
import { useSignIn } from "@clerk/nextjs/legacy";
import { Button } from "@/components/ui/button";

function clerkErrorMessage(err: unknown, fallback: string): string {
  return (
    (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ?? fallback
  );
}

/**
 * Self-service password reset (2026-08-15) — Carve's login form had no path
 * out of a forgotten password at all (confirmed: no "forgot password" link
 * anywhere in the codebase before this). Two-step Clerk flow, mirroring
 * login-form.tsx's existing needs_client_trust step's shape (request a code
 * by email, then verify it) rather than inventing a different pattern:
 *
 *   1. `signIn.create({ strategy: "reset_password_email_code", identifier })`
 *      — Clerk emails a one-time code to the address, if an account exists
 *      for it. Deliberately shows the SAME "check your email" state whether
 *      or not the address is registered (Clerk's own behavior) — never
 *      reveal account existence through this form.
 *   2. `signIn.attemptFirstFactor({ strategy: "reset_password_email_code",
 *      code })` to verify the code, then `signIn.resetPassword({ password })`
 *      to actually set the new password — this also completes sign-in
 *      (`createdSessionId`), so a successful reset lands the founder
 *      straight in their dashboard rather than back at the login form.
 */
export function ForgotPasswordForm({ redirectTo }: { redirectTo: string }) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleRequestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setError(null);
    setIsPending(true);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email });
      setStep("verify");
    } catch (err) {
      setError(clerkErrorMessage(err, "Could not send a reset code. Please check the email and try again."));
    } finally {
      setIsPending(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setError(null);
    setIsPending(true);
    try {
      await signIn.attemptFirstFactor({ strategy: "reset_password_email_code", code });
      const result = await signIn.resetPassword({ password });

      if (result.status !== "complete") {
        setError("That code didn't work. Please check it and try again.");
        setIsPending(false);
        return;
      }

      await setActive({ session: result.createdSessionId });
      // Full navigation (not client-side router.push) so proxy.ts runs again
      // and the (dashboard) layout sees the new session — same reasoning as
      // login-form.tsx's own post-sign-in navigation.
      window.location.assign(redirectTo);
    } catch (err) {
      setError(clerkErrorMessage(err, "Could not reset your password. Please check the code and try again."));
      setIsPending(false);
    }
  }

  if (step === "verify") {
    return (
      <form
        onSubmit={handleResetPassword}
        className="w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card p-6 shadow-[6px_6px_0_var(--border)]"
      >
        <div className="space-y-1">
          <p className="font-mono text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Carve workspace
          </p>
          <h1 className="font-display text-2xl font-semibold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            Enter the code we sent to {email}, then choose a new password.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="code" className="text-sm font-medium">
            Verification code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={!isLoaded || isPending} className="w-full">
          {isPending ? "Resetting…" : "Reset password"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => setStep("request")}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Use a different email
          </button>
        </p>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleRequestCode}
      className="w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card p-6 shadow-[6px_6px_0_var(--border)]"
    >
      <div className="space-y-1">
        <p className="font-mono text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Carve workspace
        </p>
        <h1 className="font-display text-2xl font-semibold">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a code to reset your password.
        </p>
      </div>

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div id="clerk-captcha" />
      <Button type="submit" disabled={!isLoaded || isPending} className="w-full">
        {isPending ? "Sending…" : "Send reset code"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
