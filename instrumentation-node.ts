/**
 * Node.js-only half of `instrumentation.ts` — see that file for why this is
 * split out and dynamically imported rather than inlined.
 *
 * Gated on `LANGFUSE_SECRET_KEY`/`LANGFUSE_PUBLIC_KEY`, matching
 * `lib/observability/langfuse.ts`'s own gate — if neither is set (no
 * Langfuse project configured for this environment), this is a no-op: no
 * OTel SDK starts, no background export loop runs, zero overhead.
 *
 * Must run before anything it's meant to trace imports/executes — this is
 * why it lives in `instrumentation.ts`'s `register()`, which Next.js
 * guarantees runs before the rest of the server starts handling requests,
 * rather than being imported ad hoc from wherever tracing is first needed.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

if (process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY) {
  const sdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
  });
  sdk.start();
}
