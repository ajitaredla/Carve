/**
 * Shared fixtures for the Playwright suite. Each spec file provisions its
 * OWN test founder (a fixed, spec-specific email) rather than sharing one
 * global user — `Brand.founderId` is `@unique` (one brand per founder, per
 * prisma/schema.prisma), so sharing a single test user across specs running
 * in parallel (playwright.config.ts's `fullyParallel: true`) would race on
 * the same Brand row. Separate users keep every spec file independent and
 * safely parallelizable.
 *
 * Bypasses the real signup flow deliberately: the app's signup flow
 * (app/login/signup-form.tsx) requires an inline email-code round-trip (a
 * real inbox, unsuitable for CI), so this uses relative (not `@/`) imports
 * of the app's own `lib/prisma.ts` and the Clerk Backend SDK directly to
 * provision an already-usable user and its matching `Founder` row — the
 * same two pieces of state the real signup flow would have created, just
 * without the email round-trip.
 */

import { clerkClient } from "@clerk/nextjs/server";
import type { Page } from "@playwright/test";
import { prisma } from "../lib/prisma";

const TEST_PASSWORD = "e2e-test-password-not-real-12345";

// Clerk's dev-instance test convention: any `+clerk_test@` email address
// always accepts this fixed code for email_code verification (signup, and
// the Client Trust second factor below) — no real inbox involved. Every
// fixed test email in this file and the spec files must use that pattern
// for these helpers to work.
const CLERK_TEST_CODE = "424242";

/** A fresh Playwright browser context has no history with Clerk, so it's
 * always an "unrecognized" client — every sign-in through the real login
 * form (never just Backend-API session creation) hits Clerk's Client Trust
 * check and needs this extra emailed-code step (see login-form.tsx's
 * `needs_client_trust` handling). No-op if the account/client is already
 * trusted and the sign-in completed in one step. */
async function completeClientTrustIfPrompted(page: Page): Promise<void> {
  const codeField = page.getByLabel("Verification code");
  const appeared = await codeField
    .waitFor({ timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;

  await codeField.fill(CLERK_TEST_CODE);
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

export interface TestFounder {
  id: string;
  email: string;
}

/**
 * Gets-or-creates a Clerk user plus its matching `Founder` row (mirroring
 * provisionFounder's create path — see app/login/actions.ts), then deletes
 * any Brand/Assessment/etc. left over from a previous run so every spec
 * starts from a clean slate.
 */
export async function ensureTestFounder(email: string, name: string): Promise<TestFounder> {
  const client = await clerkClient();

  const { data: existingUsers } = await client.users.getUserList({ emailAddress: [email] });
  const clerkUser =
    existingUsers[0] ??
    (await client.users.createUser({
      emailAddress: [email],
      password: TEST_PASSWORD,
    }));

  const founder = await prisma.founder.upsert({
    where: { clerkUserId: clerkUser.id },
    create: { clerkUserId: clerkUser.id, email, name },
    update: { email, name },
  });

  await resetBrandState(founder.id);

  return { id: founder.id, email };
}

/** Deletes this founder's Brand and every dependent row, in FK order (no
 * cascade configured in the schema — see scripts/eval-verifier.ts's
 * destroyFixture for the same pattern). Safe to call on a founder with no
 * Brand yet (all deleteMany calls are no-ops). `founderId` is `Founder.id`
 * (the Prisma primary key), not the Clerk user id. */
export async function resetBrandState(founderId: string): Promise<void> {
  const brand = await prisma.brand.findUnique({ where: { founderId } });
  if (!brand) return;

  const assessments = await prisma.assessment.findMany({
    where: { brandId: brand.id },
    select: { id: true },
  });
  const assessmentIds = assessments.map((a) => a.id);

  // GeneratedDocument.generationLogId is a NOT NULL FK into GenerationLog —
  // documents (the child) must go before logs (the parent), not the other
  // way around.
  await prisma.generatedDocument.deleteMany({
    where: { assessmentId: { in: assessmentIds } },
  });
  await prisma.generationLog.deleteMany({
    where: { assessmentId: { in: assessmentIds } },
  });
  await prisma.outcome.deleteMany({ where: { brandId: brand.id } });
  await prisma.costWaterfall.deleteMany({
    where: { assessmentId: { in: assessmentIds } },
  });
  await prisma.assessment.deleteMany({ where: { brandId: brand.id } });
  await prisma.brand.delete({ where: { id: brand.id } });
}

export function testPassword(): string {
  return TEST_PASSWORD;
}

/**
 * `live` project counterpart to `ensureTestFounder` — creates only the
 * Clerk user via the Backend SDK, with NO Prisma access. The `live` project
 * targets the real deployed app (playwright.config.ts's `isLive` branch has
 * no local webServer), whose actual production database isn't reachable
 * from a laptop by design (the class platform's own rule: "your container
 * is the only thing that can reach the database"). The matching `Founder`
 * row gets provisioned by the deployed app itself, via its own self-heal
 * flow (components/account-not-provisioned.tsx) — see `loginAsLive` below.
 */
export async function ensureLiveTestUser(email: string): Promise<void> {
  const client = await clerkClient();
  const { data: existingUsers } = await client.users.getUserList({ emailAddress: [email] });
  if (existingUsers[0]) return;

  await client.users.createUser({
    emailAddress: [email],
    password: TEST_PASSWORD,
  });
}

/** Logs in against the real deployed app and, if this is the account's
 * first-ever login (no Founder row yet), completes the self-heal flow
 * (PR #25 — "Finish setting up my account") using the deployed app's own
 * production database access, not ours. */
export async function loginAsLive(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await completeClientTrustIfPrompted(page);
  await page.waitForURL("**/dashboard");

  const finishSetupButton = page.getByRole("button", {
    name: "Finish setting up my account",
  });
  if (await finishSetupButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await finishSetupButton.click();
    await page.waitForURL("**/dashboard");
  }
}

/** Drives the real login form — every spec starts here, not via a saved
 * storage state, so the login flow itself stays covered by every run. */
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await completeClientTrustIfPrompted(page);
  await page.waitForURL("**/dashboard");
}

export interface IntakeFormFillOptions {
  /** Embedded verbatim into Brand.name, which flows into every generation
   * kickoff prompt via `wrapUntrustedField` (see actions/documents.ts /
   * actions/assessment.ts) — this is the real, through-the-UI mechanism for
   * triggering CARVE_MOCK_AGENTS's MOCK_FLAG_ME/MOCK_INCOMPLETE_ME/
   * MOCK_ERROR_ME markers, not a shortcut around it. */
  brandNameSuffix?: string;
  retailerName: string;
  /** The intake Server Action awaits a full generate+verify cycle
   * synchronously before redirecting — mocked calls resolve fast (default
   * 30s is generous), but a real Managed Agents session can genuinely take
   * longer. Override for the `live` project. */
  submitTimeoutMs?: number;
}

/** Fills and submits the full intake form (components/assessment/intake-form.tsx),
 * with reasonable defaults for a passing (well above the 40% margin minimum,
 * <30-day lead time not required — score just needs to compute) assessment.
 * Waits for the resulting navigation to /assessment/[id]. */
export async function fillIntakeForm(page: Page, options: IntakeFormFillOptions): Promise<void> {
  await page.goto("/assessment/new");

  const brandName = options.brandNameSuffix
    ? `E2E Test Brand ${options.brandNameSuffix}`
    : "E2E Test Brand";

  await page.getByLabel("Brand name").fill(brandName);
  await page.getByLabel("Category").fill("Shelf-stable snacks");
  await page.getByLabel("DTC annual revenue (USD)").fill("400000");
  await page.getByLabel("Wholesale price (per unit)").fill("4.50");
  await page.getByLabel("Retail (shelf) price (per unit)").fill("10.00");
  await page.getByLabel("KeHE relationship").check();
  await page.getByLabel("EDI capable").check();

  await page.getByLabel("Retailer", { exact: true }).click();
  await page.getByRole("option", { name: options.retailerName }).click();

  await page.getByRole("button", { name: /Score my brand|Run this assessment/ }).click();
  // Excludes /assessment/new itself: the page is already on that URL when
  // this is called, and a bare `/\/assessment\/[^/]+$/` matches "new" too
  // (no slashes in it) — Playwright's waitForURL resolves immediately
  // against the CURRENT url if it already matches, so without this
  // exclusion the wait was a no-op that happened to go unnoticed against
  // the mocked project's near-instant generation, and only surfaced against
  // real (slow) Managed Agents latency in the `live` project.
  await page.waitForURL(/\/assessment\/(?!new$)[^/]+$/, {
    timeout: options.submitTimeoutMs ?? 30_000,
  });
}
