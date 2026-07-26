-- This baseline migration creates the complete Carve v1 schema. It is
-- intentionally generated from prisma/schema.prisma with `prisma migrate diff`
-- so `prisma migrate deploy` can initialise a fresh Azure database.

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "Certification" AS ENUM ('usda_organic', 'non_gmo', 'gluten_free', 'sqf', 'brc');

CREATE TABLE "founders" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "founders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "founder_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "dtc_annual_revenue" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wholesale_price" DECIMAL(65,30) NOT NULL,
    "retail_price" DECIMAL(65,30) NOT NULL,
    "has_kehe_relationship" BOOLEAN NOT NULL DEFAULT false,
    "has_unfi_relationship" BOOLEAN NOT NULL DEFAULT false,
    "edi_capable" BOOLEAN NOT NULL DEFAULT false,
    "eft_capable" BOOLEAN NOT NULL DEFAULT false,
    "held_certifications" "Certification"[],
    "is_dtc_only" BOOLEAN NOT NULL DEFAULT true,
    "units_per_store_per_week" DECIMAL(65,30),
    "has_co_manufacturer" BOOLEAN NOT NULL DEFAULT false,
    "lead_time_days" INTEGER NOT NULL,
    "has_regional_production_capacity" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retailers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requirements" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "retailers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "retailer_data_version" TEXT NOT NULL,
    "overall_score" INTEGER NOT NULL,
    "margin_score" INTEGER NOT NULL,
    "distributor_score" INTEGER NOT NULL,
    "certification_score" INTEGER NOT NULL,
    "timing_score" INTEGER NOT NULL,
    "velocity_score" INTEGER NOT NULL,
    "fulfillment_score" INTEGER NOT NULL,
    "blocker_dimension" TEXT NOT NULL,
    "blocker_statement" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cost_waterfalls" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "factory_cost" DECIMAL(65,30) NOT NULL,
    "co_packing_fee" DECIMAL(65,30) NOT NULL,
    "freight_to_dc" DECIMAL(65,30) NOT NULL,
    "distributor_markup_pct" DECIMAL(65,30) NOT NULL,
    "retailer_margin_pct" DECIMAL(65,30) NOT NULL,
    "chargeback_estimate" DECIMAL(65,30) NOT NULL,
    "msrp" DECIMAL(65,30) NOT NULL,
    "founder_margin_pct" DECIMAL(65,30) NOT NULL,
    "investor_verdict" TEXT NOT NULL,
    "verdict_statement" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cost_waterfalls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generated_documents" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "generation_log_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outcomes" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "assessment_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outcomes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generation_logs" (
    "id" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "retailer_data_version" TEXT NOT NULL,
    "brand_input_snapshot" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "verification_result" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessment_id" TEXT,
    "cost_waterfall_id" TEXT,
    CONSTRAINT "generation_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "founders_email_key" ON "founders"("email");
CREATE UNIQUE INDEX "brands_founder_id_key" ON "brands"("founder_id");
CREATE UNIQUE INDEX "retailers_slug_key" ON "retailers"("slug");
CREATE UNIQUE INDEX "assessments_brand_id_retailer_id_key" ON "assessments"("brand_id", "retailer_id");
CREATE UNIQUE INDEX "cost_waterfalls_assessment_id_key" ON "cost_waterfalls"("assessment_id");
CREATE UNIQUE INDEX "generated_documents_generation_log_id_key" ON "generated_documents"("generation_log_id");

ALTER TABLE "brands" ADD CONSTRAINT "brands_founder_id_fkey" FOREIGN KEY ("founder_id") REFERENCES "founders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_waterfalls" ADD CONSTRAINT "cost_waterfalls_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_generation_log_id_fkey" FOREIGN KEY ("generation_log_id") REFERENCES "generation_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "generation_logs" ADD CONSTRAINT "generation_logs_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "generation_logs" ADD CONSTRAINT "generation_logs_cost_waterfall_id_fkey" FOREIGN KEY ("cost_waterfall_id") REFERENCES "cost_waterfalls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
