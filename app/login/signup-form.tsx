"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type SignupState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: SignupState = { error: null, message: null };

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUp, initialState);

  return (
    <form action={formAction} className="w-full max-w-sm space-y-5 card-pop p-6">
      <div className="space-y-1"><p className="carve-label">Carve workspace</p><h1 className="font-display text-3xl font-medium">Create your account</h1><p className="text-sm text-muted-foreground">Start your retail-readiness assessment in a few minutes.</p></div>
      <div className="space-y-2"><label htmlFor="name" className="text-sm font-medium">Your name</label><input id="name" name="name" type="text" required autoComplete="name" maxLength={80} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" /></div>
      <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" /></div>
      <div className="space-y-2"><label htmlFor="password" className="text-sm font-medium">Password</label><input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" /><p className="text-xs text-muted-foreground">Use at least 12 characters.</p></div>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-sm text-green">{state.message}</p> : null}
      <Button type="submit" disabled={isPending} className="w-full bg-orange text-primary-foreground hover:bg-orange/90">{isPending ? "Creating account…" : "Create account"}</Button>
      <p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="font-medium text-foreground underline underline-offset-4">Sign in</Link></p>
    </form>
  );
}
