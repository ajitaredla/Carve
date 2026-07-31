import { test, expect } from "@playwright/test";
import { ensureTestFounder, loginAs, fillIntakeForm } from "./helpers";

/**
 * Task 9.3 — session-level failures (AgentSessionError — network drop,
 * retries_exhausted) must reach the founder as `lib/errors/friendly.ts`'s
 * short, actionable message, never a raw stack/error string. Triggered via
 * the MOCK_ERROR_ME marker (session.ts's mock seam).
 *
 * Blocker-statement generation runs automatically during intake — a
 * MOCK_ERROR_ME brand name makes THAT throw too, but actions/brand.ts
 * recovers from it silently (scoring already succeeded, so intake still
 * navigates through with a "pending" blocker — this is the documented,
 * accepted v1 tradeoff for session-level failures, not a bug). Document
 * generation is where a session failure is guaranteed to surface VISIBLY
 * (actions/documents.ts's per-document try/catch always resolves with an
 * "error" status, rendered by components/documents/document-card.tsx as a
 * role="alert" message) — that's what this test actually exercises.
 */

const EMAIL = "e2e-error-edge@example.test";

test.describe("session-level failures", () => {
  test.beforeAll(async () => {
    await ensureTestFounder(EMAIL, "E2E Error Edge Founder");
  });

  test("a document generation session failure shows the friendly message, never a raw error", async ({
    page,
  }) => {
    await loginAs(page, EMAIL);

    await fillIntakeForm(page, {
      brandNameSuffix: "MOCK_ERROR_ME",
      retailerName: "Whole Foods Market",
    });

    await page.getByRole("button", { name: "Documents" }).click();
    await page.waitForURL(/\/documents$/);

    await page.getByRole("button", { name: "Generate all documents" }).click();

    const friendlyMessage = page
      .getByText(/couldn't finish this request just now/)
      .first();
    await expect(friendlyMessage).toBeVisible({ timeout: 20_000 });

    // Never a raw error/stack leaking to the founder.
    await expect(page.getByText(/AgentSessionError/)).toHaveCount(0);
    await expect(page.getByText(/at lib\/agents/)).toHaveCount(0);
    await expect(page.getByText(/^Error:/)).toHaveCount(0);
  });
});
