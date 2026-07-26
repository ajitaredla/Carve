import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentFounderAndBrand } from "@/lib/auth/current-brand";
import { Button } from "@/components/ui/button";
import { DIMENSION_LABELS } from "@/lib/scoring/dimension-labels";
import type { DimensionKey } from "@/lib/scoring/types";
import { isNotReadyForRetailer } from "@/lib/assessment/not-ready";

export default async function DashboardHomePage() {
  const founder = await getCurrentFounderAndBrand();

  if (!founder) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Account not set up yet
        </h1>
        <p className="text-muted-foreground">
          Your account isn&apos;t fully provisioned yet. Please contact support.
        </p>
      </div>
    );
  }

  if (!founder.brand) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-semibold">Welcome to Carve</h1>
        <p className="text-muted-foreground">
          Score your brand across six retail-readiness dimensions and see the
          single thing most likely to block your next PO.
        </p>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          render={<Link href="/assessment/new">Get started</Link>}
        />
      </div>
    );
  }

  const brand = founder.brand;
  const assessments = await prisma.assessment.findMany({
    where: { brandId: brand.id },
    include: { retailer: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{brand.name}</h1>
          <p className="text-muted-foreground">{brand.category}</p>
        </div>
        <Button variant="outline" render={<Link href="/assessment/new" />}>
          Add another retailer
        </Button>
      </div>

      {assessments.length === 0 ? (
        <p className="text-muted-foreground">No assessments yet — add a retailer to get your first score.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {assessments.map((assessment) => {
            const notReady = isNotReadyForRetailer(assessment.overallScore);
            const dimensionLabel = DIMENSION_LABELS[assessment.blockerDimension as DimensionKey];
            return (
              <Link key={assessment.id} href={`/assessment/${assessment.id}`} className="space-y-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/40">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-semibold">{assessment.retailer.name}</h2>
                  <span className="font-mono text-2xl font-bold tabular-nums">{assessment.overallScore}</span>
                </div>
                {notReady ? (
                  <span className="inline-block rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold tracking-wide text-destructive uppercase">Not ready yet</span>
                ) : (
                  <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Blocker: {dimensionLabel}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
