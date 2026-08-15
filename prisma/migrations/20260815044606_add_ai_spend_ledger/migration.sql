-- CreateTable
CREATE TABLE "ai_spend_ledger" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "cost_usd" DECIMAL(65,30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_spend_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_spend_ledger_created_at_idx" ON "ai_spend_ledger"("created_at");

-- CreateIndex
CREATE INDEX "ai_spend_ledger_brand_id_created_at_idx" ON "ai_spend_ledger"("brand_id", "created_at");
