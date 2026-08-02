import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { getCurrentFounderAndBrand } from "@/lib/auth/current-brand";
import { Nav } from "@/components/nav";
import { AssistantWidget } from "@/components/assistant/assistant-widget";

/**
 * Shared shell for every protected route (brand home, assessments,
 * documents, outcomes). `proxy.ts` already redirects unauthenticated
 * requests to `/login` before they reach here — this check is defense in
 * depth, kept cheap (a single `currentUser()` call) so a misconfigured
 * middleware matcher can never expose this route group.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  // Gates the floating Ask Carve widget (bottom-right, every dashboard
  // page): every quick-start question and the assistant itself depend on
  // brand context, so it has nothing useful to offer before intake is done.
  const founder = await getCurrentFounderAndBrand();

  return (
    <div className="flex min-h-full flex-col">
      <Nav
        userEmail={
          user.primaryEmailAddress?.emailAddress ??
          user.emailAddresses[0]?.emailAddress ??
          ""
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      {founder?.brand ? <AssistantWidget /> : null}
    </div>
  );
}
