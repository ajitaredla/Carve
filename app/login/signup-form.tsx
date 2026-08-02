"use client";

import Link from "next/link";
import { useState } from "react";
import { useSignUp } from "@clerk/nextjs/legacy";
import { Button } from "@/components/ui/button";
import { provisionFounder } from "./actions";

function clerkErrorMessage(err: unknown, fallback: string): string {
  return (
    (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
    fallback
  );
}

export function SignupForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setError(null);

    const formData = new FormData(event.currentTarget);
    const formName = formData.get("name");
    const email = formData.get("email");
    const password = formData.get("password");

    if (
      typeof formName !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      formName.trim().length < 2 ||
      formName.trim().length > 80 ||
      !email.includes("@") ||
      password.length < 12
    ) {
      setError(
        "Enter your name, a valid email, and a password with at least 12 characters.",
      );
      return;
    }

    setIsPending(true);
    setName(formName.trim());

    try {
      await signUp.create({
        emailAddress: email.trim().toLowerCase(),
        password,
        unsafeMetadata: { name: formName.trim() },
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err) {
      setError(clerkErrorMessage(err, "We could not create that account. Please try again."));
    } finally {
      setIsPending(false);
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setError(null);
    setIsPending(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status !== "complete") {
        setError("That code didn't work. Please check it and try again.");
        setIsPending(false);
        return;
      }

      await setActive({ session: result.createdSessionId });
      await provisionFounder(name);
      // Full navigation so proxy.ts runs again and the dashboard layout
      // sees the new session.
      window.location.assign("/dashboard");
    } catch (err) {
      setError(clerkErrorMessage(err, "That code didn't work. Please check it and try again."));
      setIsPending(false);
    }
  }

  if (pendingVerification) {
    return (
      <form onSubmit={handleVerify} className="w-full max-w-sm space-y-5 card-pop p-6">
        <div className="space-y-1">
          <p className="carve-label">Carve workspace</p>
          <h1 className="font-display text-3xl font-medium">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code we just sent you to finish creating your account.
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
        <Button
          type="submit"
          disabled={!isLoaded || isPending}
          className="w-full bg-orange text-primary-foreground hover:bg-orange/90"
        >
          {isPending ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSignUp} className="w-full max-w-sm space-y-5 card-pop p-6">
      <div className="space-y-1"><p className="carve-label">Carve workspace</p><h1 className="font-display text-3xl font-medium">Create your account</h1><p className="text-sm text-muted-foreground">Start your retail-readiness assessment in a few minutes.</p></div>
      <div className="space-y-2"><label htmlFor="name" className="text-sm font-medium">Your name</label><input id="name" name="name" type="text" required autoComplete="name" maxLength={80} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" /></div>
      <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" /></div>
      <div className="space-y-2"><label htmlFor="password" className="text-sm font-medium">Password</label><input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" /><p className="text-xs text-muted-foreground">Use at least 12 characters.</p></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {/* Required by Clerk's bot-protection (Smart CAPTCHA) when enabled on
          this instance — invisible unless a challenge is actually triggered. */}
      <div id="clerk-captcha" />
      <Button type="submit" disabled={!isLoaded || isPending} className="w-full bg-orange text-primary-foreground hover:bg-orange/90">{isPending ? "Creating account…" : "Create account"}</Button>
      <p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="font-medium text-foreground underline underline-offset-4">Sign in</Link></p>
    </form>
  );
}
