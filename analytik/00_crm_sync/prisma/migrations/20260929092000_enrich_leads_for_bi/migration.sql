-- AlterTable: Add BI Enrichment columns to leads
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "loss_reason_id" TEXT,
  ADD COLUMN IF NOT EXISTS "loss_reason_name" TEXT,
  ADD COLUMN IF NOT EXISTS "main_contact_id" TEXT,
  ADD COLUMN IF NOT EXISTS "closest_task_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "custom_fields" JSONB,
  ADD COLUMN IF NOT EXISTS "utm_source" TEXT,
  ADD COLUMN IF NOT EXISTS "utm_medium" TEXT,
  ADD COLUMN IF NOT EXISTS "utm_campaign" TEXT,
  ADD COLUMN IF NOT EXISTS "utm_content" TEXT,
  ADD COLUMN IF NOT EXISTS "utm_term" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "leads_account_id_utm_source_idx" ON "leads"("account_id", "utm_source");
CREATE INDEX IF NOT EXISTS "leads_account_id_main_contact_id_idx" ON "leads"("account_id", "main_contact_id");
CREATE INDEX IF NOT EXISTS "leads_account_id_loss_reason_name_idx" ON "leads"("account_id", "loss_reason_name");
