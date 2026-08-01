-- AlterTable
ALTER TABLE "founders" ADD COLUMN "clerk_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "founders_clerk_user_id_key" ON "founders"("clerk_user_id");
