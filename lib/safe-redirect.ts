/**
 * Only allow redirecting back to a same-origin relative path. Without this,
 * a crafted `redirectTo` (e.g. `//evil.com`, `https://evil.com`, or
 * `/\evil.com`) could be used for an open-redirect — this value is
 * user-controlled (it comes from the `redirectTo` query string, set by
 * `lib/supabase/middleware.ts` or crafted directly by an attacker), so it
 * must be validated server-side before being handed to `redirect()`.
 *
 * A plain prefix check (`startsWith("/") && !startsWith("//")`) is not
 * enough: the WHATWG URL parser (used by every browser to resolve a
 * `Location` header / navigation target) strips ASCII tab/newline/CR
 * characters wherever they appear *before* parsing. That means a path like
 * `"/\t/evil.com"` — which passes a naive prefix check — is resolved
 * identically to `"//evil.com"` and still redirects off-origin. Parsing the
 * path the same way the browser will (against a fixed dummy origin) and
 * checking the resulting origin didn't change is what actually closes this.
 *
 * Shared between `app/login/actions.ts` (a `"use server"` module, which may
 * only export async functions, so this can't live there) and
 * `app/login/page.tsx`.
 */
export function isSafeRedirectPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;

  const DUMMY_ORIGIN = "http://localhost.invalid";
  let parsed: URL;
  try {
    parsed = new URL(path, DUMMY_ORIGIN);
  } catch {
    return false;
  }

  return parsed.origin === DUMMY_ORIGIN;
}
