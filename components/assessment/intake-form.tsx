"use client";

/**
 * Task 7.1 — Intake/onboarding form (US-01).
 *
 * A single controlled form covering every founder-entered `Brand` scoring
 * fact plus the target retailer selector. Fully controlled (React state, not
 * `FormData`) so multi-select certifications and the isDtcOnly/
 * unitsPerStorePerWeek conditional relationship are simple to express, and
 * so the exact same shape can be sent straight to `saveBrandIntakeAndAssess`
 * (a plain JSON-serializable object — no `FormData` parsing needed there).
 */

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Certification } from "@prisma/client";

import { saveBrandIntakeAndAssess } from "@/actions/brand";
import type { BrandIntakeInput } from "@/lib/intake/brand-intake-schema";
import { LEAD_TIME_DAYS_MAX, LEAD_TIME_DAYS_MIN } from "@/lib/intake/brand-intake-schema";
import { CERTIFICATION_OPTIONS } from "@/lib/certifications";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IntakeFormInitialValues {
  name: string;
  category: string;
  dtcAnnualRevenue: number;
  description: string;
  wholesalePrice: number;
  retailPrice: number;
  hasKeheRelationship: boolean;
  hasUnfiRelationship: boolean;
  ediCapable: boolean;
  eftCapable: boolean;
  heldCertifications: Certification[];
  isDtcOnly: boolean;
  unitsPerStorePerWeek?: number;
  hasCoManufacturer: boolean;
  leadTimeDays: number;
  hasRegionalProductionCapacity: boolean;
}

export interface RetailerOption {
  id: string;
  slug: string;
  name: string;
}

const EMPTY_VALUES: IntakeFormInitialValues = {
  name: "",
  category: "",
  dtcAnnualRevenue: 0,
  description: "",
  wholesalePrice: 0,
  retailPrice: 0,
  hasKeheRelationship: false,
  hasUnfiRelationship: false,
  ediCapable: false,
  eftCapable: false,
  heldCertifications: [],
  isDtcOnly: true,
  unitsPerStorePerWeek: undefined,
  hasCoManufacturer: false,
  leadTimeDays: 30,
  hasRegionalProductionCapacity: false,
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

function CheckboxRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent px-2 py-1.5 hover:bg-muted/60"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-2 border-border accent-[var(--accent)]"
      />
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        {hint ? (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// IntakeForm
// ---------------------------------------------------------------------------

export function IntakeForm({
  mode,
  initialValues,
  retailers,
}: {
  mode: "create" | "update";
  initialValues: IntakeFormInitialValues | null;
  retailers: RetailerOption[];
}) {
  const router = useRouter();
  const base = initialValues ?? EMPTY_VALUES;

  const [name, setName] = useState(base.name);
  const [category, setCategory] = useState(base.category);
  const [dtcAnnualRevenue, setDtcAnnualRevenue] = useState(
    base.dtcAnnualRevenue ? String(base.dtcAnnualRevenue) : "",
  );
  const [description, setDescription] = useState(base.description);
  const [wholesalePrice, setWholesalePrice] = useState(
    base.wholesalePrice ? String(base.wholesalePrice) : "",
  );
  const [retailPrice, setRetailPrice] = useState(
    base.retailPrice ? String(base.retailPrice) : "",
  );
  const [hasKeheRelationship, setHasKeheRelationship] = useState(
    base.hasKeheRelationship,
  );
  const [hasUnfiRelationship, setHasUnfiRelationship] = useState(
    base.hasUnfiRelationship,
  );
  const [ediCapable, setEdiCapable] = useState(base.ediCapable);
  const [eftCapable, setEftCapable] = useState(base.eftCapable);
  const [heldCertifications, setHeldCertifications] = useState<
    Certification[]
  >(base.heldCertifications);
  const [isDtcOnly, setIsDtcOnly] = useState(base.isDtcOnly);
  const [unitsPerStorePerWeek, setUnitsPerStorePerWeek] = useState(
    base.unitsPerStorePerWeek !== undefined
      ? String(base.unitsPerStorePerWeek)
      : "",
  );
  const [hasCoManufacturer, setHasCoManufacturer] = useState(
    base.hasCoManufacturer,
  );
  const [leadTimeDays, setLeadTimeDays] = useState(
    String(base.leadTimeDays ?? 30),
  );
  const [hasRegionalProductionCapacity, setHasRegionalProductionCapacity] =
    useState(base.hasRegionalProductionCapacity);
  const [retailerSlug, setRetailerSlug] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleCertification(value: Certification) {
    setHeldCertifications((prev) =>
      prev.includes(value)
        ? prev.filter((c) => c !== value)
        : [...prev, value],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const input: BrandIntakeInput = {
      name,
      category,
      dtcAnnualRevenue: Number(dtcAnnualRevenue),
      description: description || undefined,
      wholesalePrice: Number(wholesalePrice),
      retailPrice: Number(retailPrice),
      hasKeheRelationship,
      hasUnfiRelationship,
      ediCapable,
      eftCapable,
      heldCertifications,
      isDtcOnly,
      unitsPerStorePerWeek:
        isDtcOnly || unitsPerStorePerWeek === ""
          ? undefined
          : Number(unitsPerStorePerWeek),
      hasCoManufacturer,
      leadTimeDays: Number(leadTimeDays),
      hasRegionalProductionCapacity,
      retailerSlug,
    };

    startTransition(async () => {
      const result = await saveBrandIntakeAndAssess(input);

      if (result.status === "success") {
        router.push(`/assessment/${result.assessmentId}`);
        return;
      }

      if (result.status === "validation_error") {
        setFieldErrors(result.fieldErrors);
        setFormError("Please fix the highlighted field(s) below.");
        return;
      }

      setFormError(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Brand basics</CardTitle>
          <CardDescription>
            Who you are and what you sell.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Brand name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              placeholder="e.g. Shelf-stable snacks"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            />
            <FieldError message={fieldErrors.category} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dtcAnnualRevenue">DTC annual revenue (USD)</Label>
            <Input
              id="dtcAnnualRevenue"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className="font-mono"
              value={dtcAnnualRevenue}
              onChange={(e) => setDtcAnnualRevenue(e.target.value)}
              required
            />
            <FieldError message={fieldErrors.dtcAnnualRevenue} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">
            Pricing — Margin Readiness
          </CardTitle>
          <CardDescription>
            Your wholesale price is what actually gets scored against a
            retailer&apos;s minimum margin — it must be greater than $0.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wholesalePrice">Wholesale price (per unit)</Label>
            <Input
              id="wholesalePrice"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              className="font-mono"
              value={wholesalePrice}
              onChange={(e) => setWholesalePrice(e.target.value)}
              required
            />
            <FieldError message={fieldErrors.wholesalePrice} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="retailPrice">Retail (shelf) price (per unit)</Label>
            <Input
              id="retailPrice"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              className="font-mono"
              value={retailPrice}
              onChange={(e) => setRetailPrice(e.target.value)}
              required
            />
            <FieldError message={fieldErrors.retailPrice} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">
            Distributor Readiness
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 sm:grid-cols-2">
          <CheckboxRow
            id="hasKeheRelationship"
            label="KeHE relationship"
            hint="KeHE Distributors — the primary distributor pathway for brands targeting Sprouts, Fresh Thyme, and Natural Grocers."
            checked={hasKeheRelationship}
            onChange={setHasKeheRelationship}
          />
          <CheckboxRow
            id="hasUnfiRelationship"
            label="UNFI relationship"
            hint="United Natural Foods Inc. — a distributor Whole Foods typically requires before finalizing a purchase order."
            checked={hasUnfiRelationship}
            onChange={setHasUnfiRelationship}
          />
          <CheckboxRow
            id="ediCapable"
            label="EDI capable"
            hint="Electronic Data Interchange, for receiving/processing POs."
            checked={ediCapable}
            onChange={setEdiCapable}
          />
          <CheckboxRow
            id="eftCapable"
            label="EFT capable"
            hint="Electronic Funds Transfer, for distributor/retailer payment terms."
            checked={eftCapable}
            onChange={setEftCapable}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">
            Certification Readiness
          </CardTitle>
          <CardDescription>
            Select every certification your brand currently holds.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 sm:grid-cols-3">
          {CERTIFICATION_OPTIONS.map((option) => (
            <CheckboxRow
              key={option.value}
              id={`cert-${option.value}`}
              label={option.label}
              hint={option.hint}
              checked={heldCertifications.includes(option.value)}
              onChange={() => toggleCertification(option.value)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Velocity</CardTitle>
          <CardDescription>
            Retailers typically expect 2-3+ units per store per week to
            maintain placement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            role="switch"
            aria-checked={isDtcOnly}
            onClick={() => setIsDtcOnly((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/60"
          >
            <span className="text-sm">
              <span className="font-medium">DTC-only</span>
              <span className="block text-xs text-muted-foreground">
                No retail placement yet — no units-per-store-per-week data
                exists.
              </span>
            </span>
            <span
              aria-hidden
              className={`relative h-5 w-9 shrink-0 rounded-full border border-border transition-colors ${
                isDtcOnly ? "bg-accent" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow transition-transform ${
                  isDtcOnly ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </span>
          </button>

          <div className="space-y-1.5">
            <Label htmlFor="unitsPerStorePerWeek">
              Units per store per week
            </Label>
            <Input
              id="unitsPerStorePerWeek"
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              className="font-mono"
              disabled={isDtcOnly}
              value={unitsPerStorePerWeek}
              onChange={(e) => setUnitsPerStorePerWeek(e.target.value)}
              placeholder={isDtcOnly ? "N/A — brand is DTC-only" : undefined}
            />
            <FieldError message={fieldErrors.unitsPerStorePerWeek} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">
            Fulfillment Readiness
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1 sm:grid-cols-2">
            <CheckboxRow
              id="hasCoManufacturer"
              label="Co-manufacturer in place"
              hint="A third-party production facility that manufactures your product — most major retailers require one before issuing a PO at scale."
              checked={hasCoManufacturer}
              onChange={setHasCoManufacturer}
            />
            <CheckboxRow
              id="hasRegionalProductionCapacity"
              label="Capacity for regional rollout"
              checked={hasRegionalProductionCapacity}
              onChange={setHasRegionalProductionCapacity}
            />
          </div>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="leadTimeDays">
              Production lead time (days)
            </Label>
            <Input
              id="leadTimeDays"
              type="number"
              min={LEAD_TIME_DAYS_MIN}
              max={LEAD_TIME_DAYS_MAX}
              step="1"
              inputMode="numeric"
              className="font-mono"
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Retailers expect under 30 days. Must be between{" "}
              {LEAD_TIME_DAYS_MIN} and {LEAD_TIME_DAYS_MAX}.
            </p>
            <FieldError message={fieldErrors.leadTimeDays} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">
            Target retailer
          </CardTitle>
          <CardDescription>
            Which retailer should this assessment be scored against?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="retailerSlug">Retailer</Label>
            <Select
              // Keep this controlled from the first render. Passing undefined
              // for the empty state made Base UI switch modes after selection.
              value={retailerSlug}
              onValueChange={(value) => setRetailerSlug(String(value))}
            >
              <SelectTrigger id="retailerSlug" className="w-full">
                <SelectValue placeholder="Choose a retailer…" />
              </SelectTrigger>
              <SelectContent>
                {retailers.map((retailer) => (
                  <SelectItem key={retailer.id} value={retailer.slug}>
                    {retailer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {retailers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No retailers are set up yet — check back soon.
              </p>
            ) : null}
            <FieldError message={fieldErrors.retailerSlug} />
          </div>
        </CardContent>
      </Card>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isPending}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
      >
        {isPending
          ? "Scoring your brand…"
          : mode === "create"
            ? "Score my brand"
            : "Run this assessment"}
      </Button>
    </form>
  );
}
