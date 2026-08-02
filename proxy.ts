import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Paths that do NOT require an authenticated session. Everything else is
 * treated as protected (fail closed) — safer default given that nearly the
 * entire app lives behind auth (the `(dashboard)` route group covers the
 * brand home, assessments, documents, and outcomes). Route groups like
 * `(dashboard)` don't appear in the URL, so this list is matched against the
 * actual pathname, not the file-system group name.
 */
const isPublicRoute = createRouteMatcher(["/", "/login", "/signup"]);

// Next.js 16 renamed the "middleware" file convention to "proxy" (same
// mechanism — runs before every matched request, now on the Node.js runtime
// by default). Redirect logic here mirrors the pre-Clerk implementation
// exactly (same `redirectTo` query param, read by app/login/page.tsx)
// rather than relying on `auth.protect()`'s default hosted-sign-in
// redirect, since Carve uses its own custom-styled /login page, not
// Clerk's hosted UI.
export const proxy = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;

  const { userId } = await auth();
  if (!userId) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }
});

export const config = {
  matcher: [
    /*
     * Run on every request except static assets, Next.js internals, and API
     * routes. API routes (e.g. /api/mcp, task 4.0) authenticate machine
     * callers (Managed Agents sessions) with their own bearer-token check,
     * not a browser session cookie — letting this auth gate run against them
     * would redirect every unauthenticated call to /login before the route
     * handler's own auth ever executes.
     *
     * `media/` (everything under public/media, e.g. the marketing page's
     * video) is excluded as a whole path prefix rather than by extension —
     * it's all public content, and an extension list here silently breaks
     * again (redirecting the asset to /login instead of serving it) every
     * time a new format shows up, the way .mp4/.webm/.vtt originally did.
     */
    "/((?!api/|_next/static|_next/image|media/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
