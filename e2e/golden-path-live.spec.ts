import { test, expect } from "@playwright/test";
import { ensureLiveTestUser, loginAsLive, fillIntakeForm } from "./helpers";

/**
 * The `live` project counterpart to golden-path.spec.ts — targets the REAL
 * deployed app (https://carve.apps.human-angle.com, playwright.config.ts's
 * `isLive` branch: no local webServer, use.baseURL points there directly),
 * real Managed Agents sessions, real Claude API calls, real money and real
 * latency on every run.
 *
 * Why this can't run against a local/CI-spun server (a real correction —
 * an earlier version of this spec tried that and failed for exactly this
 * reason, not a pipeline bug): carve-generator/carve-verifier are wired to
 * the ONE real deployed /api/mcp origin, which reads the ONE real
 * production database. A freshly-started local or CI server would use a
 * completely different database — data it creates would be invisible to
 * those agents. Only requests that go through the real deployed app land
 * in the database the agents actually query. Likewise, this file uses
 * `ensureLiveTestUser`/`loginAsLive` (Clerk Backend SDK only, no direct
 * Prisma/production-DB access — the class platform's own rule: "your
 * container is the only thing that can reach the database") and relies on
 * the deployed app's own self-heal flow (PR #25,
 * components/account-not-provisioned.tsx) to provision the Founder row
 * using the deployed app's own production DB access, not ours.
 *
 * Assertions check the RENDERED page, not exact text (real LLM output
 * isn't deterministic run to run) — a resolved outcome is either a real
 * blocker statement or an explicit "needs review," never the
 * not-yet-generated placeholder staying visible forever.
 *
 * Not run on every PR (playwright.config.ts's `live` project is wired to a
 * separate CI job gated to push-to-main) — see npm run test:e2e:live.
 */

const EMAIL = "e2e-golden-path-live+clerk_test@example.com";
const NOT_STARTED_TEXT = "Your blocker statement hasn't been generated yet.";
const NEEDS_REVIEW_TEXT = "This result needs review.";

test.describe("golden path (live)", () => {
  test.beforeAll(async () => {
    await ensureLiveTestUser(EMAIL);
  });

  test("a real assessment against the deployed app resolves to a final blocker statement or an explicit needs_review", async ({
    page,
  }) => {
    // Real Managed Agents sessions (generate + independent verify, each
    // its own cloud-container create -> stream -> drain round trip) take
    // real time — give this generous headroom over the mocked suite's
    // default.
    test.setTimeout(180_000);

    await loginAsLive(page, EMAIL);
    await fillIntakeForm(page, {
      retailerName: "Whole Foods Market",
      submitTimeoutMs: 120_000,
    });

    // The intake Server Action already awaited the full generate+verify
    // cycle before redirecting here, so this is the final state, not a
    // pending one. This is a CLIENT-SIDE router.push() navigation, though —
    // the URL can update before the new page's content finishes streaming
    // in, so use an auto-waiting assertion (not a one-shot isVisible()
    // call, which raced against that exact window in an earlier version of
    // this test and produced a false "not started" reading).
    const blockerHeading = page.getByRole("heading", { name: /The single blocker/ });
    await expect(blockerHeading).toBeVisible({ timeout: 15_000 });

    const stillNotStarted = await page.getByText(NOT_STARTED_TEXT).isVisible();

    if (stillNotStarted) {
      // A real session-level failure (network hiccup, or the verifier's
      // real output not matching the strict PASS/FLAGGED: <text> format —
      // see actions/brand.ts's now-logged recovery path) is a known,
      // real-world possibility this project's own PRD flags as needing an
      // eval pass. Retry once via the founder's own "Generate" button
      // before failing the test, to distinguish a one-off flake from a
      // systemic break.
      await page.getByRole("button", { name: "Generate" }).click();
      await expect(page.getByRole("button", { name: "Generating…" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Generating…" })).toBeHidden({
        timeout: 120_000,
      });
    }

    const needsReview = await page.getByText(NEEDS_REVIEW_TEXT).isVisible().catch(() => false);
    if (needsReview) {
      // A live model legitimately flagging something is an acceptable
      // outcome — what matters is it's an EXPLICIT state, not silence.
      await expect(page.getByText(/Carve's verifier flagged something/)).toBeVisible();
    } else {
      // Final: the blocker heading is present and NOT the not-started copy.
      await expect(page.getByRole("heading", { name: /The single blocker/ })).toBeVisible();
      await expect(page.getByText(NOT_STARTED_TEXT)).toHaveCount(0);
    }
  });
});
