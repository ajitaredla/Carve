import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";

/**
 * Shared shell for every protected route (brand home, assessments,
 * documents, outcomes). `middleware.ts` already redirects unauthenticated
 * requests to `/login` before they reach here — this check is defense in
 * depth, kept cheap (a single `getUser()` call) so a misconfigured
 * middleware matcher can never expose this route group.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col">
      <Nav userEmail={user.email ?? ""} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
