import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the "middleware" file convention to "proxy" (same
// mechanism — runs before every matched request, now on the Node.js runtime
// by default). The Supabase session-refresh logic itself lives in
// lib/supabase/middleware.ts, matching Supabase's own docs naming.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every request except static assets, Next.js internals, and API
     * routes. API routes (e.g. /api/mcp, task 4.0) authenticate machine
     * callers (Managed Agents sessions) with their own bearer-token check,
     * not a browser session cookie — letting this Supabase session gate run
     * against them would redirect every unauthenticated call to /login
     * before the route handler's own auth ever executes.
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
