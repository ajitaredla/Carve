-- CreateTable
CREATE TABLE "retailer_requirement_proposals" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "proposed_requirements" JSONB NOT NULL,
    "source_url" TEXT,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "retailer_requirement_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leap_alert_logs" (
    "id" TEXT NOT NULL,
    "retailer_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leap_alert_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "retailer_requirement_proposals" ADD CONSTRAINT "retailer_requirement_proposals_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leap_alert_logs" ADD CONSTRAINT "leap_alert_logs_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
