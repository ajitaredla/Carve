import { test, expect } from "@playwright/test";
import { ensureTestFounder, loginAs, fillIntakeForm } from "./helpers";

/**
 * Task 9.2 — same brand assessed against a second retailer (per 6.6b's
 * schema fix: one CURRENT assessment per brand+retailer pair, via
 * `@@unique([brandId, retailerId])` — supports multi-retailer pursuit, not
 * just one active retailer per brand). Confirms the UI actually lets a
 * founder do this (the "Add another retailer" path from the dashboard),
 * and that both assessments coexist and are independently reachable.
 */

const EMAIL = "e2e-multi-retailer@example.test";

test.describe("multi-retailer", () => {
  test.beforeAll(async () => {
    await ensureTestFounder(EMAIL, "E2E Multi Retailer Founder");
  });

  test("the same brand can be assessed against both v1 retailers, and the dashboard lists both", async ({
    page,
  }) => {
    await loginAs(page, EMAIL);

    await fillIntakeForm(page, { retailerName: "Whole Foods Market" });
    await expect(page.getByRole("heading", { name: "Whole Foods Market" })).toBeVisible();

    // Back to the dashboard, then pursue a second retailer for the SAME
    // brand — the intake form re-opens pre-filled (mode: "update"), not a
    // fresh onboarding flow, since Brand.founderId is @unique (6.6b).
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await page.waitForURL(/\/dashboard$/);
    await page.getByRole("button", { name: "Add another retailer" }).click();
    await page.waitForURL(/\/assessment\/new$/);

    // Brand fields are pre-filled from the existing Brand row — only the
    // retailer needs choosing this time.
    await expect(page.getByLabel("Brand name")).toHaveValue("E2E Test Brand");
    await page.getByLabel("Retailer", { exact: true }).click();
    await page.getByRole("option", { name: "Sprouts Farmers Market" }).click();
    await page
      .getByRole("button", { name: /Score my brand|Run this assessment/ })
      .click();
    await page.waitForURL(/\/assessment\/[^/]+$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Sprouts Farmers Market" })).toBeVisible();

    // Both assessments now coexist on the dashboard, independently reachable.
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await page.waitForURL(/\/dashboard$/);
    await expect(page.getByRole("link", { name: /Whole Foods Market/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sprouts Farmers Market/ })).toBeVisible();

    await page.getByRole("link", { name: /Whole Foods Market/ }).click();
    await expect(page.getByRole("heading", { name: "Whole Foods Market" })).toBeVisible();
  });
});
