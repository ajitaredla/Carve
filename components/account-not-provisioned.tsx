import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { provisionFounder } from "@/app/login/actions";

/**
 * Recovery path for two cases documented in lib/auth/current-brand.ts and
 * app/login/actions.ts's provisionFounder:
 *   1. The "partial signup" case — signUp's client-side flow creates the
 *      Clerk user and verifies email first, then calls provisionFounder();
 *      if that second step never ran (e.g. a tab closed mid-flow), the
 *      account is left authenticated with no Founder row.
 *   2. The Clerk cutover backfill case — a founder who signed up back when
 *      auth was Supabase has a Founder row with no clerkUserId yet. Their
 *      first sign-in after the cutover lands here; retrying provisions
 *      (links, in this case) their row via the same trusted, server-
 *      verified Clerk session provisionFounder() already relies on — it can
 *      only ever affect the caller's own account.
 */
export function AccountNotProvisioned({ redirectTo }: { redirectTo: string }) {
  async function retry() {
    "use server";

    const user = await currentUser();
    if (!user) redirect("/login");

    await provisionFounder();

    redirect(redirectTo);
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Account not set up yet
      </h1>
      <p className="text-muted-foreground">
        Setup didn&apos;t finish right after signup — this can happen if it
        ran during a deploy. It usually resolves itself; try again below.
      </p>
      <form action={retry}>
        <Button type="submit">Finish setting up my account</Button>
      </form>
    </div>
  );
}
