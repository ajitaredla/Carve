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

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [needsClientTrust, setNeedsClientTrust] = useState(false);
  const [code, setCode] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");

    if (typeof email !== "string" || typeof password !== "string") {
      setError("Email and password are required.");
      setIsPending(false);
      return;
    }

    try {
      const result = await signIn.create({ identifier: email, password });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        // Full navigation (not client-side router.push) so proxy.ts runs
        // again and the server-rendered (dashboard) layout sees the new
        // session.
        window.location.assign(redirectTo);
        return;
      }

      // Signing in from an unrecognized browser/device — Clerk requires an
      // extra emailed-code step (Client Trust) before it'll issue a
      // session, even though the password itself already verified.
      if (result.status === "needs_client_trust") {
        await signIn.prepareSecondFactor({ strategy: "email_code" });
        setNeedsClientTrust(true);
        setIsPending(false);
        return;
      }

      setError("Could not sign you in. Please try again.");
      setIsPending(false);
    } catch (err) {
      setError(
        clerkErrorMessage(err, "Could not sign you in. Please check your email and password."),
      );
      setIsPending(false);
    }
  }

  async function handleVerifyClientTrust(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setError(null);
    setIsPending(true);

    try {
      const result = await signIn.attemptSecondFactor({ strategy: "email_code", code });

      if (result.status !== "complete") {
        setError("That code didn't work. Please check it and try again.");
        setIsPending(false);
        return;
      }

      await setActive({ session: result.createdSessionId });
      window.location.assign(redirectTo);
    } catch (err) {
      setError(clerkErrorMessage(err, "That code didn't work. Please check it and try again."));
      setIsPending(false);
    }
  }

  if (needsClientTrust) {
    return (
      <form
        onSubmit={handleVerifyClientTrust}
        className="w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card p-6 shadow-[6px_6px_0_var(--border)]"
      >
        <div className="space-y-1">
          <p className="font-mono text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Carve workspace
          </p>
          <h1 className="font-display text-2xl font-semibold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            New browser or device — enter the 6-digit code we just sent you to finish signing in.
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
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={!isLoaded || isPending} className="w-full">
          {isPending ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
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

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* Required by Clerk's bot-protection (Smart CAPTCHA) when enabled on
          this instance — invisible unless a challenge is actually triggered. */}
      <div id="clerk-captcha" />
      <Button type="submit" disabled={!isLoaded || isPending} className="w-full">
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
