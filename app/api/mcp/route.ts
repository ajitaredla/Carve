/**
 * Carve MCP Server endpoint (task 4.0) — Streamable HTTP transport, wired
 * into a Next.js Route Handler.
 *
 * ---------------------------------------------------------------------------
 * Why this shape
 * ---------------------------------------------------------------------------
 *
 * Per `.scratch/carve-v1-agentic-architecture.md`, this route is how Claude
 * Managed Agents sessions (task 5.0's `carve-generator` / `carve-verifier`)
 * fetch real Carve data instead of trusting whatever's in a prompt. Managed
 * Agents' `mcp_servers` field just needs a reachable URL, so this can live as
 * a route in the same Next.js app rather than a separate service.
 *
 * The SDK ships two server transports for Streamable HTTP:
 *   - `StreamableHTTPServerTransport` (server/streamableHttp.js) — a Node.js
 *     `IncomingMessage`/`ServerResponse` wrapper, for Express-style servers.
 *   - `WebStandardStreamableHTTPServerTransport`
 *     (server/webStandardStreamableHttp.js) — built directly on Web Standard
 *     `Request`/`Response`, "for Node.js Express/HTTP compatibility, use
 *     StreamableHTTPServerTransport; for web-standard environments... use
 *     WebStandardStreamableHTTPServerTransport directly" (the SDK's own
 *     doc comment).
 *
 * A Next.js Route Handler's `NextRequest`/`Response` ARE Web Standard
 * objects — there is no Node `req`/`res` pair here to wrap — so
 * `WebStandardStreamableHTTPServerTransport` is the correct match, not the
 * Node.js wrapper. `transport.handleRequest(request)` takes the Web Standard
 * `Request` directly and returns a `Response`, which is exactly a Next.js
 * Route Handler's contract.
 *
 * ---------------------------------------------------------------------------
 * Why stateless mode, and why a fresh McpServer per request
 * ---------------------------------------------------------------------------
 *
 * `WebStandardStreamableHTTPServerTransportOptions.sessionIdGenerator` is
 * left `undefined` on purpose — that's the SDK's documented way to opt into
 * "stateless mode" (no session tracking, no in-memory connection map). A
 * Next.js Route Handler on Vercel has no guarantee that two requests in the
 * same MCP session land on the same server instance, so in-memory session
 * state would be unreliable here regardless; stateless + `enableJsonResponse`
 * (plain JSON response body, no SSE stream to keep open) is also what the
 * MCP TypeScript SDK's own guidance recommends for "simple API-style
 * servers," which is exactly what these four read-only tools are.
 *
 * A brand-new `McpServer` (see `lib/mcp/tools.ts`) and transport are built on
 * every request rather than reused across requests/module scope. Tool
 * registration is pure/cheap (no I/O), and `McpServer.connect()` takes
 * ownership of a transport — sharing one long-lived `McpServer` across
 * concurrent requests connected to different transports is not a supported
 * shape, so per-request instances are what keep concurrent requests fully
 * isolated from each other.
 *
 * ---------------------------------------------------------------------------
 * Auth / trust boundary (task 4.6 — read before touching this)
 * ---------------------------------------------------------------------------
 *
 * This route is machine-to-machine only: Managed Agents sessions call it
 * with a single shared bearer token (env var `MCP_SERVER_TOKEN`), the same
 * credential a Vault will hold for both `carve-generator` and
 * `carve-verifier` (task 5.0). There is deliberately NO per-founder identity
 * here — the token proves "this caller is a legitimate Carve Managed Agents
 * session," nothing more granular.
 *
 * This is safe only because brand-ownership checking happens entirely
 * upstream: the Server Action that kicks off a Managed Agents session
 * (task 6.0) must call `lib/auth/current-brand.ts` first, confirm the
 * signed-in founder actually owns the brand/assessment being generated for,
 * and only then create a session and hand the agent a `brandId`/
 * `assessmentId` to look up through these tools. The MCP tools in
 * `lib/mcp/tools.ts` never re-derive or check that ownership themselves —
 * there is no founder identity available at this layer to check it against.
 * If a future caller (or a bug in a Server Action) creates a session for the
 * wrong brand, this route has no way to catch that — by design, not by
 * oversight. See task 1.0's architect review and task 4.7's QC gate for the
 * prior discussion; this is flagged again here so it's easy to find during
 * `security-auditor`'s pass.
 *
 * `proxy.ts`'s Supabase session-refresh gate explicitly excludes `/api/*`
 * (see that file's `config.matcher` comment) specifically so this route can
 * run its own bearer check instead of being redirected to `/login` for
 * having no browser session cookie — confirmed still true as of this task.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { createCarveMcpServer } from "@/lib/mcp/tools";

// Prisma's `@prisma/adapter-pg` driver adapter needs the Node.js runtime
// (raw TCP/pg), not the Edge runtime.
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Bearer-token auth
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison so a byte-by-byte early-exit compare (`===`)
 * can't be used to time-attack the token. Length is checked up front, which
 * does leak the *length* of the expected token through timing — an accepted
 * tradeoff (not a per-user secret being brute-forced over a public endpoint;
 * this is one static, high-entropy shared credential rotated via the Vault
 * in task 5.0), and the standard shape for this comparison in Node.
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Checks the `Authorization: Bearer <token>` header against `MCP_SERVER_TOKEN`.
 * Returns `false` (never throws) for any missing/malformed/wrong case,
 * including a missing env var — fail closed rather than assume.
 */
function isAuthorized(request: NextRequest): boolean {
  const expectedToken = process.env.MCP_SERVER_TOKEN;
  if (!expectedToken) {
    console.error(
      "MCP_SERVER_TOKEN is not set — rejecting all /api/mcp requests. " +
        "Copy .env.example to .env and set a token, or configure it in the " +
        "deployment environment.",
    );
    return false;
  }

  const header = request.headers.get("authorization");
  if (!header) {
    return false;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return false;
  }

  return safeCompare(token, expectedToken);
}

function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "unauthorized",
      message: "Missing or invalid bearer token.",
    },
    {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    },
  );
}

// ---------------------------------------------------------------------------
// Streamable HTTP dispatch
// ---------------------------------------------------------------------------

async function handleMcpPost(request: NextRequest): Promise<Response> {
  const server = createCarveMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless mode — see file header for why.
    sessionIdGenerator: undefined,
    // Plain JSON responses rather than an SSE stream — matches the
    // request/response shape of a serverless Route Handler invocation and
    // is the SDK's own recommendation for stateless, API-style servers.
    enableJsonResponse: true,
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // Not strictly load-bearing in stateless mode (nothing outlives this
    // function call — no shared session map, no lingering timers) but
    // matches the MCP SDK's own documented stateless example, which closes
    // both objects once the response is ready. Cheap, and keeps this route
    // aligned with upstream guidance if a future SDK version's
    // stateless-mode internals turn out to hold something worth releasing.
    await transport.close();
    await server.close();
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }
  return handleMcpPost(request);
}

// Stateless mode doesn't support the standalone GET (server-initiated SSE
// notifications) or DELETE (session termination) flows — there is no
// server-held session for either to act on, since every POST gets a fresh
// transport. Still auth-gate them the same way for consistency, then report
// the standard "not supported" response rather than a bare 404/500.
export async function GET(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }
  return NextResponse.json(
    {
      error: "method_not_supported",
      message:
        "This MCP server runs in stateless mode and does not support the " +
        "standalone GET/SSE stream. Send JSON-RPC requests via POST.",
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function DELETE(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }
  return NextResponse.json(
    {
      error: "method_not_supported",
      message:
        "This MCP server runs in stateless mode — there is no server-held " +
        "session to terminate.",
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
