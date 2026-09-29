-- CreateIndex
CREATE UNIQUE INDEX "accounts_subdomain_base_domain_key" ON "accounts"("subdomain", "base_domain");

