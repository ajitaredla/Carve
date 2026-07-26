"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSafeRedirectPath } from "@/lib/safe-redirect";
import { prisma } from "@/lib/prisma";

export type LoginState = { error: string | null };
export type SignupState = { error: string | null; message: string | null };

function getAppOrigin(requestHeaders: Headers): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const redirectToRaw = formData.get("redirectTo");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.trim() === "" ||
    password === ""
  ) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Supabase's own error message is safe to surface (it doesn't leak
    // whether the account exists vs. the password being wrong).
    return { error: error.message };
  }

  const redirectTo =
    typeof redirectToRaw === "string" && isSafeRedirectPath(redirectToRaw)
      ? redirectToRaw
      : "/dashboard";

  redirect(redirectTo);
}

export async function signUp(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    name.trim().length < 2 ||
    name.trim().length > 80 ||
    !email.includes("@") ||
    password.length < 12
  ) {
    return {
      error: "Enter your name, a valid email, and a password with at least 12 characters.",
      message: null,
    };
  }

  const supabase = await createClient();
  const origin = getAppOrigin(await headers());
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    return { error: "We could not create that account. Please try again.", message: null };
  }

  // Supabase intentionally returns an obfuscated user for an email that is
  // already registered. Only provision a Founder for a genuinely new user.
  if (data.user?.identities?.length) {
    try {
      await prisma.founder.upsert({
        where: { id: data.user.id },
        create: {
          id: data.user.id,
          email: email.trim().toLowerCase(),
          name: name.trim(),
        },
        update: { email: email.trim().toLowerCase() },
      });
    } catch {
      // Do not reveal provisioning internals or account existence. The user
      // can safely retry, and support can reconcile a rare partial signup.
      return {
        error: "Your account was created, but setup needs attention. Please contact support before signing in.",
        message: null,
      };
    }
  }

  return {
    error: null,
    message: "Check your email to confirm your Carve account, then sign in.",
  };
}
