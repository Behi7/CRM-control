-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ai_model" TEXT DEFAULT 'gemini-2.5-flash',
ADD COLUMN "ai_encrypted_token" TEXT,
ADD COLUMN "ai_company_context" TEXT;

