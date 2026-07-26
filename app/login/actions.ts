"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSafeRedirectPath } from "@/lib/safe-redirect";

export type LoginState = { error: string | null };

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
      : "/";

  redirect(redirectTo);
}
