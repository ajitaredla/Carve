import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paths that do NOT require an authenticated session. Everything else is
 * treated as protected (fail closed) — safer default given that nearly the
 * entire app lives behind auth (the `(dashboard)` route group covers the
 * brand home, assessments, documents, and outcomes). Route groups like
 * `(dashboard)` don't appear in the URL, so this list is matched against the
 * actual pathname, not the file-system group name.
 */
const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Refreshes the Supabase auth session on every request and redirects
 * unauthenticated users away from protected routes to `/login`.
 *
 * IMPORTANT: this must run in `proxy.ts` (Next.js 16's renamed `middleware.ts`
 * convention) for every non-static request.
 * `supabase.auth.getUser()` re-validates the session token against Supabase
 * (unlike reading the cookie alone) and, via the cookie handlers below,
 * writes back a refreshed session cookie so Server Components later in the
 * request don't see a stale/expired token.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not run any code between `createServerClient` and `getUser()` —
  // doing so can cause hard-to-debug session refresh issues (per Supabase's
  // own guidance for this pattern).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // IMPORTANT: `supabaseResponse` must be returned as-is (or with its
  // cookies copied onto whatever response you return). Creating a new
  // `NextResponse` here without copying cookies will desync the session.
  return supabaseResponse;
}
