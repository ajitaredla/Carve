import { test, expect } from "@playwright/test";
import { ensureTestFounder, loginAs, fillIntakeForm } from "./helpers";

/**
 * Task 9.3 — a needs_review outcome surfaced correctly, not swallowed as a
 * generic error. Uses lib/agents/session.ts's CARVE_MOCK_AGENTS marker
 * (MOCK_FLAG_ME, embedded in Brand.name — see fillIntakeForm's doc comment
 * for why this is the real, through-the-UI trigger, not a shortcut): per
 * that file's own header, a single MOCK_FLAG_ME in the kickoff prompt
 * deterministically drives the whole FLAGGED -> regenerate -> FLAGGED again
 * -> needs_review path, since the marker propagates through the follow-up
 * correction too.
 *
 * `generateBlockerStatement` runs automatically as part of
 * `saveBrandIntakeAndAssess` (actions/brand.ts) — no separate "generate"
 * click needed, the needs_review state is already on the page right after
 * intake submits.
 */

const EMAIL = "e2e-needs-review+clerk_test@example.com";

test.describe("needs_review", () => {
  test.beforeAll(async () => {
    await ensureTestFounder(EMAIL, "E2E Needs Review Founder");
  });

  test("a flagged-twice blocker statement shows 'needs review', not a generic error, and survives a refresh", async ({
    page,
  }) => {
    await loginAs(page, EMAIL);

    await fillIntakeForm(page, {
      brandNameSuffix: "MOCK_FLAG_ME",
      retailerName: "Sprouts Farmers Market",
    });

    await expect(page.getByText("This result needs review.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/Carve's verifier flagged something/),
    ).toBeVisible();

    // Task 7.0b's whole reason for existing: this must be reconstructible
    // from GenerationLog on a fresh page load, not just live in the React
    // state from the request that triggered it.
    await page.reload();
    await expect(page.getByText("This result needs review.")).toBeVisible();
  });
});
