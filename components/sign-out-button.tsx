"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      // Full navigation (not just router.refresh) so the middleware runs
      // again and the server-rendered (dashboard) layout re-checks auth.
      router.push("/login");
      router.refresh();
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
