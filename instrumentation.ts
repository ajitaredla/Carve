/**
 * Next.js's native instrumentation hook — runs once when the server starts,
 * before any request is handled. Used here to bootstrap the OpenTelemetry
 * NodeSDK + Langfuse span processor (see `instrumentation-node.ts`) that
 * `lib/observability/langfuse.ts`'s manual instrumentation relies on to ship
 * spans anywhere.
 *
 * Split into a separate `instrumentation-node.ts`, dynamically imported only
 * under the Node.js runtime, rather than importing `@opentelemetry/sdk-node`
 * directly here — this file's own top-level imports get analyzed for EVERY
 * runtime Next.js might invoke it under (including Edge, e.g. for
 * middleware), and Node-only APIs `@opentelemetry/sdk-node` needs don't
 * exist there. This is Next.js's own documented pattern for OTel setup, not
 * a Carve-specific workaround.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
