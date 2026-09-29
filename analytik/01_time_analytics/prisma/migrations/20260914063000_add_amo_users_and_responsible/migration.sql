-- CreateTable
CREATE TABLE "amo_users" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "amo_users_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "responsible_user_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "amo_users_account_id_external_id_key" ON "amo_users"("account_id", "external_id");

-- CreateIndex
CREATE INDEX "leads_account_id_responsible_user_id_idx" ON "leads"("account_id", "responsible_user_id");

-- CreateIndex
CREATE INDEX "leads_account_id_crm_created_at_idx" ON "leads"("account_id", "crm_created_at");

-- AddForeignKey
ALTER TABLE "amo_users" ADD CONSTRAINT "amo_users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "amo_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

