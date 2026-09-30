-- CreateTable
CREATE TABLE IF NOT EXISTS "custom_field_definitions" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "field_type" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enums" JSONB,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "custom_field_definitions_account_id_external_id_key" ON "custom_field_definitions"("account_id", "external_id");
CREATE INDEX IF NOT EXISTS "custom_field_definitions_account_id_field_type_idx" ON "custom_field_definitions"("account_id", "field_type");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'custom_field_definitions_account_id_fkey'
    ) THEN
        ALTER TABLE "custom_field_definitions"
        ADD CONSTRAINT "custom_field_definitions_account_id_fkey"
        FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
