-- Brand-scoped assistant conversation history. Messages are retained so the
-- founder can revisit prior advice; every record is attached to a single
-- Brand and is enforced by application-level ownership checks.

CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_conversations_brand_id_updated_at_idx"
ON "chat_conversations"("brand_id", "updated_at");

CREATE INDEX "chat_messages_conversation_id_created_at_idx"
ON "chat_messages"("conversation_id", "created_at");

CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages"("created_at");

ALTER TABLE "chat_conversations"
ADD CONSTRAINT "chat_conversations_brand_id_fkey"
FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_messages"
ADD CONSTRAINT "chat_messages_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
