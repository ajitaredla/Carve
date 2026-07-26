import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { Brand, Founder } from "@prisma/client";

/**
 * Identity convention (decided during task 1.0's architecture review):
 * `Founder.id` is always set equal to the corresponding Supabase Auth user's
 * UUID — never auto-generated — so looking up a founder's own data never
 * needs an email-based join, and stays correct even if the founder's email
 * changes later. Enforced at provisioning time (Phase 1 is concierge/manual
 * per PRD §12, so there is no self-serve signup flow yet to enforce this in
 * automatically — whoever provisions a Founder row must set `id` explicitly
 * to `supabaseUser.id`).
 *
 * Why this matters more than usual: Prisma connects via `@prisma/adapter-pg`
 * with a role that owns the tables, which bypasses Postgres RLS in practice
 * (RLS is defense-in-depth only, per PRD §10's architectural principle — it
 * is never the primary enforcement mechanism). That makes the founder→brand
 * ownership check inside this helper the *actual* data-isolation boundary
 * for every Server Action that reads or writes brand-scoped data. Every
 * Server Action that needs the current brand MUST go through this function
 * rather than re-deriving the lookup itself.
 */
export async function getCurrentFounderAndBrand(): Promise<
  (Founder & { brand: Brand | null }) | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Shouldn't normally happen on a route proxy.ts already protects, but
    // fail closed rather than assume.
    return null;
  }

  return prisma.founder.findUnique({
    where: { id: user.id },
    include: { brand: true },
  });
}

/**
 * Same as {@link getCurrentFounderAndBrand}, but throws if no Founder row
 * exists yet for this authenticated Supabase user (e.g. concierge account
 * not yet provisioned) or if that founder has no Brand yet. Use this in
 * Server Actions where proceeding without a brand is a bug, not a state to
 * render around.
 */
export async function requireCurrentBrand(): Promise<Brand> {
  const founder = await getCurrentFounderAndBrand();

  if (!founder) {
    throw new Error(
      "No Founder record for the current authenticated user. Account may not be provisioned yet.",
    );
  }

  if (!founder.brand) {
    throw new Error(
      `Founder ${founder.id} has no Brand yet — brand intake may not be complete.`,
    );
  }

  return founder.brand;
}
