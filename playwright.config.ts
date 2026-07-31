import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * Task 9.0 (never built) — full end-to-end coverage, exercising the real
 * browser -> auth -> intake -> scoring -> AI generation -> persistence ->
 * re-render loop, not just component-level UI.
 *
 * Two projects, not one, per the deliberate cost/determinism tradeoff:
 *
 * - `mocked` (default, every PR): the dev server runs with
 *   CARVE_MOCK_AGENTS=1 (lib/agents/session.ts's / completeness.ts's
 *   existing mock seam — see their own file headers). Free, fast,
 *   deterministic — this is what lets needs-review/error-edge-cases assert
 *   exact outcomes via the MOCK_FLAG_ME/MOCK_INCOMPLETE_ME/MOCK_ERROR_ME
 *   markers instead of hoping a real model produces a specific result.
 * - `live` (main branch only, via CI workflow condition — not run on every
 *   PR): real credentials, real Managed Agents sessions, real Claude API
 *   calls. Assertions here check STRUCTURAL properties (a GenerationLog row
 *   exists, status is final/needs_review, a document got created) rather
 *   than exact text, since real LLM output isn't deterministic. This is
 *   real money and real latency on every run — deliberately kept to the
 *   golden path only, not the full matrix the mocked project covers.
 */
const isLive = process.env.PLAYWRIGHT_PROJECT === "live";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: isLive ? "https://carve.apps.human-angle.com" : "http://localhost:3210",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mocked",
      testMatch: /golden-path\.spec\.ts|needs-review\.spec\.ts|error-edge-cases\.spec\.ts|multi-retailer\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "live",
      testMatch: /golden-path-live\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // The `live` project deliberately has NO webServer: it targets the real
  // deployed app (use.baseURL above), not a freshly spun-up local/CI
  // instance. This isn't a style choice — carve-generator/carve-verifier
  // are wired to the ONE real deployed /api/mcp origin (agents/carve-
  // generator.agent.yaml), which reads the ONE real production database. A
  // local or CI-spun server would use a completely different database, so
  // data it creates would be invisible to those agents — get_brand_context
  // would correctly return "not found" for a brand the live agents have no
  // way to see. Only requests that actually go through the real deployed
  // app land in the database the agents query.
  webServer: isLive
    ? undefined
    : {
        // A production build (next build && next start), not `next dev` —
        // dev mode compiles routes on demand, which under this suite's 4
        // concurrent workers caused real, non-deterministic timeouts mid
        // Server Action (confirmed via a captured page snapshot showing a
        // request still "Scoring your brand…" well past when it should
        // have resolved). A production server handles concurrent requests
        // properly and is faster once built. CARVE_MOCK_AGENTS is read at
        // request time, not baked into the build (unlike NEXT_PUBLIC_*
        // values), so it's safe to set only here.
        command: "npm run build && CARVE_MOCK_AGENTS=1 npm run start -- -p 3210",
        url: "http://localhost:3210",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
