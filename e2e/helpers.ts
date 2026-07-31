/**
 * Shared fixtures for the Playwright suite. Each spec file provisions its
 * OWN test founder (a fixed, spec-specific email) rather than sharing one
 * global user — `Brand.founderId` is `@unique` (one brand per founder, per
 * prisma/schema.prisma), so sharing a single test user across specs running
 * in parallel (playwright.config.ts's `fullyParallel: true`) would race on
 * the same Brand row. Separate users keep every spec file independent and
 * safely parallelizable.
 *
 * Bypasses the real signup flow deliberately: `app/login/actions.ts`'s
 * `signUp` requires email confirmation (a real inbox, unsuitable for CI), so
 * this uses relative (not `@/`) imports of the app's own `lib/prisma.ts` and
 * the Supabase Admin API directly to provision an already-confirmed user and
 * its matching `Founder` row — the same two pieces of state `signUp` would
 * have created, just without the email round-trip.
 */

import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { prisma } from "../lib/prisma";

const TEST_PASSWORD = "e2e-test-password-not-real-12345";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run the e2e suite locally.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface TestFounder {
  id: string;
  email: string;
}

/**
 * Gets-or-creates a confirmed Supabase Auth user plus its matching `Founder`
 * row (mirroring `signUp`'s own `prisma.founder.upsert` — see that file),
 * then deletes any Brand/Assessment/etc. left over from a previous run so
 * every spec starts from a clean slate.
 */
export async function ensureTestFounder(email: string, name: string): Promise<TestFounder> {
  const supabase = adminClient();

  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  let user = existingUsers.users.find((u) => u.email === email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`Failed to create test user ${email}: ${error?.message}`);
    }
    user = data.user;
  }

  await prisma.founder.upsert({
    where: { id: user.id },
    create: { id: user.id, email, name },
    update: { email, name },
  });

  await resetBrandState(user.id);

  return { id: user.id, email };
}

/** Deletes this founder's Brand and every dependent row, in FK order (no
 * cascade configured in the schema — see scripts/eval-verifier.ts's
 * destroyFixture for the same pattern). Safe to call on a founder with no
 * Brand yet (all deleteMany calls are no-ops). */
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
 * `live` project counterpart to `ensureTestFounder` — creates/confirms only
 * the Supabase Auth user via the Admin API, with NO Prisma access. The
 * `live` project targets the real deployed app (playwright.config.ts's
 * `isLive` branch has no local webServer), whose actual production
 * database isn't reachable from a laptop by design (the class platform's
 * own rule: "your container is the only thing that can reach the
 * database"). The matching `Founder` row gets provisioned by the deployed
 * app itself, via its own self-heal flow (components/account-not-
 * provisioned.tsx) — see `loginAsLive` below.
 */
export async function ensureLiveTestUser(email: string): Promise<void> {
  const supabase = adminClient();
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers.users.find((u) => u.email === email);
  if (existing) return;

  const { error } = await supabase.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`Failed to create live test user ${email}: ${error.message}`);
  }
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
  await page.waitForURL(/\/assessment\/[^/]+$/, {
    timeout: options.submitTimeoutMs ?? 30_000,
  });
}
