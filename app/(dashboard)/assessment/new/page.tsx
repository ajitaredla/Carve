import { prisma } from "@/lib/prisma";
import { getCurrentFounderAndBrand } from "@/lib/auth/current-brand";
import {
  IntakeForm,
  type IntakeFormInitialValues,
} from "@/components/assessment/intake-form";

/**
 * Task 7.1 — Intake/onboarding form (US-01).
 *
 * Handles both cases a founder can land here in (per the task brief, since
 * `Brand` is one-per-founder — task 1.0/6.6b's design):
 *   - First-ever brand: `founder.brand` is `null` — the form starts empty,
 *     titled/worded as a first-time intake.
 *   - "Assess against another retailer" for an existing brand: `founder.brand`
 *     already exists — the form is pre-filled with the brand's current facts
 *     (still editable, since those facts can change between assessments) and
 *     worded as adding a new retailer, not starting over.
 */
export default async function NewAssessmentPage() {
  const founder = await getCurrentFounderAndBrand();

  if (!founder) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Account not set up yet
        </h1>
        <p className="text-muted-foreground">
          Your account isn&apos;t fully provisioned yet. Please contact
          support.
        </p>
      </div>
    );
  }

  const brand = founder.brand;

  const [retailers, existingAssessments] = await Promise.all([
    prisma.retailer.findMany({ orderBy: { name: "asc" } }),
    brand
      ? prisma.assessment.findMany({
          where: { brandId: brand.id },
          include: { retailer: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const initialValues: IntakeFormInitialValues | null = brand
    ? {
        name: brand.name,
        category: brand.category,
        dtcAnnualRevenue: brand.dtcAnnualRevenue.toNumber(),
        description: brand.description ?? "",
        wholesalePrice: brand.wholesalePrice.toNumber(),
        retailPrice: brand.retailPrice.toNumber(),
        hasKeheRelationship: brand.hasKeheRelationship,
        hasUnfiRelationship: brand.hasUnfiRelationship,
        ediCapable: brand.ediCapable,
        eftCapable: brand.eftCapable,
        heldCertifications: brand.heldCertifications,
        isDtcOnly: brand.isDtcOnly,
        unitsPerStorePerWeek: brand.unitsPerStorePerWeek?.toNumber(),
        hasCoManufacturer: brand.hasCoManufacturer,
        leadTimeDays: brand.leadTimeDays,
        hasRegionalProductionCapacity: brand.hasRegionalProductionCapacity,
      }
    : null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {brand ? `Assess ${brand.name} against another retailer` : "Tell us about your brand"}
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          {brand
            ? "Your brand profile is already on file — update anything that's changed below, then pick a retailer to score against."
            : "Carve scores your brand across six retail-readiness dimensions and surfaces the single thing most likely to block your next PO."}
        </p>
      </div>

      {existingAssessments.length > 0 ? (
        <div className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Already scored against:{" "}
          {existingAssessments.map((a) => a.retailer.name).join(", ")}.
          Selecting one of these again below will re-score it with your
          latest answers.
        </div>
      ) : null}

      <IntakeForm
        mode={brand ? "update" : "create"}
        initialValues={initialValues}
        retailers={retailers.map((r) => ({
          id: r.id,
          slug: r.slug,
          name: r.name,
        }))}
      />
    </div>
  );
}
