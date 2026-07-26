import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Uses the anon key (never the service-role key) so row-level
 * security still applies — this client is scoped to the request's cookie
 * session, not a privileged bypass.
 *
 * Must be created fresh per request (it closes over `cookies()`), so call
 * this inside the Server Component / Server Action / Route Handler that
 * needs it rather than caching the result at module scope.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `setAll` was called from a Server Component, which can't set
            // cookies on the response. Safe to ignore as long as the
            // middleware is refreshing the session on every request (it is
            // — see middleware.ts), so cookies still get refreshed there.
          }
        },
      },
    },
  );
}
