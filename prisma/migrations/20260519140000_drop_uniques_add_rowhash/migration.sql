-- Drop composite unique indexes/constraints on 11 fact tables to allow
-- intra-file duplicates. Idempotency now enforced app-side via rowHash.
-- Earlier migrations created these as UNIQUE INDEX in some cases and as
-- CONSTRAINT in others; drop both forms defensively.

-- fba_receipts
DROP INDEX IF EXISTS "fba_receipts_fnsku_receiptDate_shipmentId_key";
ALTER TABLE "fba_receipts" DROP CONSTRAINT IF EXISTS "fba_receipts_fnsku_receiptDate_shipmentId_key";
ALTER TABLE "fba_receipts" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;
CREATE INDEX IF NOT EXISTS "fba_receipts_rowHash_idx" ON "fba_receipts"("rowHash");

-- customer_returns
DROP INDEX IF EXISTS "customer_returns_orderId_fnsku_returnDate_key";
ALTER TABLE "customer_returns" DROP CONSTRAINT IF EXISTS "customer_returns_orderId_fnsku_returnDate_key";
ALTER TABLE "customer_returns" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;
CREATE INDEX IF NOT EXISTS "customer_returns_rowHash_idx" ON "customer_returns"("rowHash");

-- reimbursements
DROP INDEX IF EXISTS "reimbursements_reimbursementId_msku_fnsku_key";
ALTER TABLE "reimbursements" DROP CONSTRAINT IF EXISTS "reimbursements_reimbursementId_msku_fnsku_key";
ALTER TABLE "reimbursements" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;
CREATE INDEX IF NOT EXISTS "reimbursements_rowHash_idx" ON "reimbursements"("rowHash");

-- fba_removals
DROP INDEX IF EXISTS "fba_removals_orderId_fnsku_requestDate_key";
ALTER TABLE "fba_removals" DROP CONSTRAINT IF EXISTS "fba_removals_orderId_fnsku_requestDate_key";
ALTER TABLE "fba_removals" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;
CREATE INDEX IF NOT EXISTS "fba_removals_rowHash_idx" ON "fba_removals"("rowHash");

-- fc_transfers
DROP INDEX IF EXISTS "fc_transfers_fnsku_transferDate_referenceId_key";
ALTER TABLE "fc_transfers" DROP CONSTRAINT IF EXISTS "fc_transfers_fnsku_transferDate_referenceId_key";
ALTER TABLE "fc_transfers" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;
CREATE INDEX IF NOT EXISTS "fc_transfers_rowHash_idx" ON "fc_transfers"("rowHash");

-- shipment_status
DROP INDEX IF EXISTS "shipment_status_shipmentId_key";
ALTER TABLE "shipment_status" DROP CONSTRAINT IF EXISTS "shipment_status_shipmentId_key";
ALTER TABLE "shipment_status" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;
CREATE INDEX IF NOT EXISTS "shipment_status_rowHash_idx" ON "shipment_status"("rowHash");

-- fba_summary
DROP INDEX IF EXISTS "fba_summary_msku_fnsku_disposition_summaryDate_store_key";
ALTER TABLE "fba_summary" DROP CONSTRAINT IF EXISTS "fba_summary_msku_fnsku_disposition_summaryDate_store_key";
ALTER TABLE "fba_summary" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;
CREATE INDEX IF NOT EXISTS "fba_summary_rowHash_idx" ON "fba_summary"("rowHash");

-- replacements
DROP INDEX IF EXISTS "replacements_orderId_msku_replacementOrderId_key";
ALTER TABLE "replacements" DROP CONSTRAINT IF EXISTS "replacements_orderId_msku_replacementOrderId_key";
ALTER TABLE "replacements" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;
CREATE INDEX IF NOT EXISTS "replacements_rowHash_idx" ON "replacements"("rowHash");

-- removal_shipments
DROP INDEX IF EXISTS "removal_shipments_orderId_fnsku_trackingNumber_key";
ALTER TABLE "removal_shipments" DROP CONSTRAINT IF EXISTS "removal_shipments_orderId_fnsku_trackingNumber_key";
ALTER TABLE "removal_shipments" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;
CREATE INDEX IF NOT EXISTS "removal_shipments_rowHash_idx" ON "removal_shipments"("rowHash");

-- gnr_report
DROP INDEX IF EXISTS "gnr_report_orderId_fnsku_reportDate_lpn_key";
ALTER TABLE "gnr_report" DROP CONSTRAINT IF EXISTS "gnr_report_orderId_fnsku_reportDate_lpn_key";
ALTER TABLE "gnr_report" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;
CREATE INDEX IF NOT EXISTS "gnr_report_rowHash_idx" ON "gnr_report"("rowHash");

-- payment_repository
DROP INDEX IF EXISTS "payment_repository_settlementId_orderId_sku_lineType_postedDatetime_key";
DROP INDEX IF EXISTS "payment_repository_settlementId_orderId_sku_lineType_posted_key";
ALTER TABLE "payment_repository" DROP CONSTRAINT IF EXISTS "payment_repository_settlementId_orderId_sku_lineType_postedDatetime_key";
ALTER TABLE "payment_repository" DROP CONSTRAINT IF EXISTS "payment_repository_settlementId_orderId_sku_lineType_posted_key";
ALTER TABLE "payment_repository" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;
CREATE INDEX IF NOT EXISTS "payment_repository_rowHash_idx" ON "payment_repository"("rowHash");
