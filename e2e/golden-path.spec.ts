import { test, expect } from "@playwright/test";
import { ensureTestFounder, loginAs, fillIntakeForm } from "./helpers";

/**
 * Task 9.1 — the full stack, real browser as the entry point: auth (real
 * Supabase login) -> intake (real Brand persistence) -> scoring (real
 * Assessment row) -> AI generation (mocked via CARVE_MOCK_AGENTS=1, so
 * outcomes are deterministic) -> waterfall -> all 6 documents -> outcome
 * logging -> refresh and confirm the persisted state re-renders correctly.
 */

const EMAIL = "e2e-golden-path@example.test";

test.describe("golden path", () => {
  test.beforeAll(async () => {
    await ensureTestFounder(EMAIL, "E2E Golden Path Founder");
  });

  test("login -> intake -> score -> waterfall -> documents -> outcome, full loop", async ({
    page,
  }) => {
    await loginAs(page, EMAIL);

    await fillIntakeForm(page, { retailerName: "Whole Foods Market" });

    // Assessment detail page: a real, computed score is visible (the
    // overall-score badge, plus 6 per-dimension scores, all match this
    // pattern — .first() just confirms at least one rendered).
    await expect(page.getByText(/\d{1,3}\s*\/\s*100/).first()).toBeVisible();

    // The floating Ask Carve widget appears now that a brand exists
    // (app/(dashboard)/layout.tsx gates it on founder?.brand).
    await expect(page.getByRole("button", { name: "Open Ask Carve" })).toBeVisible();

    // --- Waterfall ---------------------------------------------------
    await page.getByRole("button", { name: "Cost waterfall" }).click();
    await page.waitForURL(/\/waterfall$/);

    await page.getByLabel("Factory cost (per unit)").fill("1.00");
    await page.getByLabel("Co-packing fee (per unit)").fill("0.50");
    await page.getByLabel("Freight to DC (per unit)").fill("0.25");
    await page.getByLabel("Distributor markup (%)").fill("20");
    await page.getByLabel("Chargeback estimate (per unit)").fill("0.10");
    await page.getByLabel("MSRP").fill("10.00");
    await page
      .getByRole("button", { name: /Calculate & generate verdict/ })
      .click();

    // Mocked generation resolves quickly to a final verdict — the pending
    // "Calculating…" label disappears and a verdict statement renders.
    await expect(
      page.getByRole("button", { name: /Recalculate & regenerate verdict/ }),
    ).toBeVisible({ timeout: 15_000 });

    // --- Documents (all 6, mocked PASS-first-try since Brand.name carries
    // no MOCK_* marker) ------------------------------------------------
    await page.goto(page.url().replace(/\/waterfall$/, "/documents"));

    await page.getByRole("button", { name: "Generate all documents" }).click();

    // All 6 cards settle to a Regenerate button (== final state) within a
    // generous timeout — mocked calls are fast, but 6 run concurrently.
    await expect(page.getByRole("button", { name: "Regenerate" })).toHaveCount(
      6,
      { timeout: 20_000 },
    );
    await expect(page.getByRole("button", { name: "Copy" })).toHaveCount(6);

    // --- Refresh: durable state must survive a fresh page load, not just
    // live in React state from the request that generated it (task 7.0b's
    // whole reason for existing). --------------------------------------
    await page.reload();
    await expect(page.getByRole("button", { name: "Regenerate" })).toHaveCount(6);

    // --- Outcome logging ------------------------------------------------
    await page.goto(page.url().replace(/\/documents$/, "/outcome"));
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: /Won/ }).click();
    await page.getByLabel("Notes (optional)").fill("E2E golden path run.");
    await page.getByRole("button", { name: "Log outcome" }).click();

    await expect(page.getByText("Logged — thanks for closing the loop.")).toBeVisible();
  });
});
