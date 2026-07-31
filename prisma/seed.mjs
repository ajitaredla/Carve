import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Concierge MVP v1 retailers (Carve_PRD_v3.md §"Primary Retailers v1":
// Whole Foods Market, Sprouts Farmers Market). Requirements below are
// illustrative placeholders, not verified against either retailer's actual
// current criteria — flagged as such in `notes`, which get_retailer_requirements
// (lib/mcp/tools.ts) hands to the generator/verifier agents for citation, so
// that caveat surfaces wherever this data gets cited rather than presenting a
// guess as fact. Replace with confirmed figures once real retailer-onboarding
// data exists — this is a plain upsert, no code changes needed to correct it.
//
// Plain JS (not TS): runs via `node prisma/seed.mjs` inside the deployed
// container (prisma.config.ts's `migrations.seed`), which has no TypeScript
// runtime — only the isolated prisma-cli install and the app's own traced
// dependencies (see Dockerfile).
const RETAILERS = [
  {
    slug: "whole-foods-market",
    name: "Whole Foods Market",
    requirements: {
      minGrossMarginPct: 40,
      requiredCertifications: ["usda_organic", "non_gmo"],
      submissionWindow: { open: true, daysUntilNextWindow: null },
      distributorOptions: ["UNFI", "KeHE"],
      programName: "Local & National Buying Window (illustrative)",
      notes:
        "Illustrative placeholder requirements for the concierge MVP — not verified against Whole Foods' actual current criteria. Confirm with a real buyer or UNFI rep before treating any figure here as fact.",
    },
  },
  {
    slug: "sprouts-farmers-market",
    name: "Sprouts Farmers Market",
    requirements: {
      minGrossMarginPct: 38,
      requiredCertifications: ["non_gmo"],
      submissionWindow: { open: true, daysUntilNextWindow: null },
      distributorOptions: ["UNFI", "KeHE"],
      programName: "New Item Submission (illustrative)",
      notes:
        "Illustrative placeholder requirements for the concierge MVP — not verified against Sprouts' actual current criteria. Confirm with a real buyer or UNFI rep before treating any figure here as fact.",
    },
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot seed retailers.");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  for (const retailer of RETAILERS) {
    await prisma.retailer.upsert({
      where: { slug: retailer.slug },
      create: retailer,
      update: { name: retailer.name, requirements: retailer.requirements },
    });
    console.log(`[seed] upserted retailer: ${retailer.slug}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[seed] failed", error);
  process.exit(1);
});
