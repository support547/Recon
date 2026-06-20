-- Reconciles drift: settlement_report.account_type + indexes were added via db push
-- and existed in the working DB without a migration. Idempotent guards make it safe
-- to apply against databases where the column/indexes are already present.

-- AlterTable
ALTER TABLE "settlement_report" ADD COLUMN IF NOT EXISTS "account_type" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "settlement_report_account_type_idx" ON "settlement_report"("account_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "settlement_report_settlement_id_account_type_store_idx" ON "settlement_report"("settlement_id", "account_type", "store");
