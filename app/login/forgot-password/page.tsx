import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isSafeRedirectPath } from "@/lib/safe-redirect";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo: redirectToRaw } = await searchParams;

  const redirectTo =
    redirectToRaw && isSafeRedirectPath(redirectToRaw)
      ? redirectToRaw
      : "/dashboard";

  const { userId } = await auth();

  if (userId) {
    redirect(redirectTo);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <ForgotPasswordForm redirectTo={redirectTo} />
    </div>
  );
}
