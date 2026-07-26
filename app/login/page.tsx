import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSafeRedirectPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo: redirectToRaw } = await searchParams;

  // `redirectTo` is attacker-controlled (it's a query param, and this page
  // is reachable while unauthenticated) — validate before ever handing it to
  // `redirect()` or embedding it in the form. See lib/safe-redirect.ts.
  const redirectTo =
    redirectToRaw && isSafeRedirectPath(redirectToRaw) ? redirectToRaw : "/";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed in — don't show the login form again.
  if (user) {
    redirect(redirectTo);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <LoginForm redirectTo={redirectTo} />
    </div>
  );
}
