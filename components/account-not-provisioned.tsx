import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

/**
 * Recovery path for the "partial signup" case documented in
 * lib/auth/current-brand.ts: signUp() creates the Supabase Auth user first,
 * then upserts the matching Founder row — if that second step fails (e.g. it
 * ran during a deploy), the account is left authenticated with no Founder
 * row and no way to retry via signup (re-submitting an existing email is
 * intentionally a no-op, to avoid leaking account existence). This lets the
 * signed-in user self-heal their own row using the same trusted, server-
 * verified id/email signUp() already relies on — it can only ever provision
 * the caller's own account.
 */
export function AccountNotProvisioned({ redirectTo }: { redirectTo: string }) {
  async function retry() {
    "use server";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const fallbackName =
      (user.user_metadata?.name as string | undefined)?.trim() ||
      user.email?.split("@")[0]?.replace(/[._-]+/g, " ") ||
      "Carve Founder";

    await prisma.founder.upsert({
      where: { id: user.id },
      create: { id: user.id, email: user.email ?? "", name: fallbackName },
      update: {},
    });

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
