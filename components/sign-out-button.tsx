"use client";

import { useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const { signOut } = useClerk();
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      // Full navigation (redirectUrl) so proxy.ts runs again and the
      // server-rendered (dashboard) layout re-checks auth.
      await signOut({ redirectUrl: "/login" });
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleSignOut}
      disabled={isPending}
    >
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
