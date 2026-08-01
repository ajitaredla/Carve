"use server";

import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Provisions or links this Founder's row after Clerk's client-side sign-up
 * or sign-in flow completes (see signup-form.tsx / login-form.tsx). Trusts
 * only the server-verified Clerk session (`currentUser()`) for identity —
 * `name` is just profile display text, never used for authorization.
 *
 * Three cases, checked in order:
 *   1. A Founder already linked to this Clerk user — nothing to do beyond
 *      keeping email in sync.
 *   2. A pre-Clerk Founder row (migrated from Supabase, `clerkUserId` still
 *      null) with a matching email — this is a founder signing in for the
 *      first time after the Clerk cutover. Link `clerkUserId` onto that
 *      EXISTING row rather than creating a new one, so their historical
 *      Brand/Assessment/GeneratedDocument data stays reachable. This is the
 *      self-heal backfill path (components/account-not-provisioned.tsx).
 *   3. Neither — a genuinely new signup.
 */
export async function provisionFounder(name?: string): Promise<void> {
  const user = await currentUser();
  if (!user) {
    throw new Error(
      "provisionFounder called without an authenticated Clerk session.",
    );
  }

  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress;
  if (!email) {
    throw new Error(`Clerk user ${user.id} has no email address.`);
  }

  const existingByClerkId = await prisma.founder.findUnique({
    where: { clerkUserId: user.id },
  });
  if (existingByClerkId) {
    await prisma.founder.update({
      where: { clerkUserId: user.id },
      data: { email },
    });
    return;
  }

  const existingByEmail = await prisma.founder.findUnique({
    where: { email },
  });
  if (existingByEmail) {
    await prisma.founder.update({
      where: { id: existingByEmail.id },
      data: { clerkUserId: user.id },
    });
    return;
  }

  const fallbackName =
    name?.trim() ||
    (user.unsafeMetadata?.name as string | undefined)?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    email.split("@")[0]?.replace(/[._-]+/g, " ") ||
    "Carve Founder";

  await prisma.founder.create({
    data: { clerkUserId: user.id, email, name: fallbackName },
  });
}
