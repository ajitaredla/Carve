import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import type { Brand, Founder } from "@prisma/client";

/**
 * Identity convention (updated when auth moved from Supabase to Clerk):
 * `Founder.clerkUserId` holds Clerk's user id, set at provisioning time —
 * `Founder.id` itself is just an opaque primary key, no longer tied to any
 * auth provider's own id. Every founder-scoped lookup goes through
 * `clerkUserId`, never email.
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
  const { userId } = await auth();

  if (!userId) {
    // Shouldn't normally happen on a route proxy.ts already protects, but
    // fail closed rather than assume.
    return null;
  }

  return prisma.founder.findUnique({
    where: { clerkUserId: userId },
    include: { brand: true },
  });
}

/**
 * Same as {@link getCurrentFounderAndBrand}, but throws if no Founder row
 * exists yet for this authenticated Clerk user (e.g. concierge account not
 * yet provisioned) or if that founder has no Brand yet. Use this in Server
 * Actions where proceeding without a brand is a bug, not a state to render
 * around.
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
