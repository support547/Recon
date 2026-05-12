-- AlterTable
ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "rowsSkipped" INTEGER NOT NULL DEFAULT 0;

-- Dedupe existing rows so unique indexes can be created (keeps earliest id per key)
DELETE FROM "shipped_to_fba" a
USING "shipped_to_fba" b
WHERE a.id > b.id
  AND a."shipmentId" IS NOT DISTINCT FROM b."shipmentId"
  AND a."msku" IS NOT DISTINCT FROM b."msku"
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku"
  AND a."shipDate" IS NOT DISTINCT FROM b."shipDate";

DELETE FROM "sales_data" a
USING "sales_data" b
WHERE a.id > b.id
  AND a."orderId" IS NOT DISTINCT FROM b."orderId"
  AND a."msku" IS NOT DISTINCT FROM b."msku"
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku"
  AND a."saleDate" IS NOT DISTINCT FROM b."saleDate";

DELETE FROM "fba_receipts" a
USING "fba_receipts" b
WHERE a.id > b.id
  AND a."shipmentId" IS NOT DISTINCT FROM b."shipmentId"
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku"
  AND a."receiptDate" IS NOT DISTINCT FROM b."receiptDate"
  AND a."eventType" IS NOT DISTINCT FROM b."eventType"
  AND a."fulfillmentCenter" IS NOT DISTINCT FROM b."fulfillmentCenter";

DELETE FROM "customer_returns" a
USING "customer_returns" b
WHERE a.id > b.id
  AND a."orderId" IS NOT DISTINCT FROM b."orderId"
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku"
  AND a."returnDate" IS NOT DISTINCT FROM b."returnDate"
  AND a."licensePlateNumber" IS NOT DISTINCT FROM b."licensePlateNumber";

DELETE FROM "reimbursements" a
USING "reimbursements" b
WHERE a.id > b.id
  AND a."reimbursementId" IS NOT DISTINCT FROM b."reimbursementId"
  AND a."msku" IS NOT DISTINCT FROM b."msku"
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku";

DELETE FROM "fba_removals" a
USING "fba_removals" b
WHERE a.id > b.id
  AND a."orderId" IS NOT DISTINCT FROM b."orderId"
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku"
  AND a."requestDate" IS NOT DISTINCT FROM b."requestDate";

DELETE FROM "fc_transfers" a
USING "fc_transfers" b
WHERE a.id > b.id
  AND a."referenceId" IS NOT DISTINCT FROM b."referenceId"
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku"
  AND a."transferDate" IS NOT DISTINCT FROM b."transferDate"
  AND a."eventType" IS NOT DISTINCT FROM b."eventType"
  AND a."fulfillmentCenter" IS NOT DISTINCT FROM b."fulfillmentCenter";

DELETE FROM "shipment_status" a
USING "shipment_status" b
WHERE a.id > b.id
  AND a."shipmentId" IS NOT DISTINCT FROM b."shipmentId";

DELETE FROM "fba_summary" a
USING "fba_summary" b
WHERE a.id > b.id
  AND a."msku" IS NOT DISTINCT FROM b."msku"
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku"
  AND a."disposition" IS NOT DISTINCT FROM b."disposition"
  AND a."summaryDate" IS NOT DISTINCT FROM b."summaryDate"
  AND a."store" IS NOT DISTINCT FROM b."store";

DELETE FROM "replacements" a
USING "replacements" b
WHERE a.id > b.id
  AND a."orderId" IS NOT DISTINCT FROM b."orderId"
  AND a."msku" IS NOT DISTINCT FROM b."msku"
  AND a."replacementOrderId" IS NOT DISTINCT FROM b."replacementOrderId";

DELETE FROM "adjustments" a
USING "adjustments" b
WHERE a.id > b.id
  AND a."msku" IS NOT DISTINCT FROM b."msku"
  AND a."uploadedAt" IS NOT DISTINCT FROM b."uploadedAt";

DELETE FROM "gnr_report" a
USING "gnr_report" b
WHERE a.id > b.id
  AND a."orderId" IS NOT DISTINCT FROM b."orderId"
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku"
  AND a."reportDate" IS NOT DISTINCT FROM b."reportDate"
  AND a."lpn" IS NOT DISTINCT FROM b."lpn";

DELETE FROM "payment_repository" a
USING "payment_repository" b
WHERE a.id > b.id
  AND a."settlementId" IS NOT DISTINCT FROM b."settlementId"
  AND a."orderId" IS NOT DISTINCT FROM b."orderId"
  AND a."sku" IS NOT DISTINCT FROM b."sku"
  AND a."lineType" IS NOT DISTINCT FROM b."lineType"
  AND a."postedDatetime" IS NOT DISTINCT FROM b."postedDatetime";

-- CreateIndex
CREATE UNIQUE INDEX "shipped_to_fba_shipmentId_msku_fnsku_shipDate_key" ON "shipped_to_fba"("shipmentId", "msku", "fnsku", "shipDate");

CREATE UNIQUE INDEX "sales_data_orderId_msku_fnsku_saleDate_key" ON "sales_data"("orderId", "msku", "fnsku", "saleDate");

CREATE UNIQUE INDEX "fba_receipts_shipmentId_fnsku_receiptDate_eventType_fulfillmentCenter_key" ON "fba_receipts"("shipmentId", "fnsku", "receiptDate", "eventType", "fulfillmentCenter");

CREATE UNIQUE INDEX "customer_returns_orderId_fnsku_returnDate_licensePlateNumber_key" ON "customer_returns"("orderId", "fnsku", "returnDate", "licensePlateNumber");

CREATE UNIQUE INDEX "reimbursements_reimbursementId_msku_fnsku_key" ON "reimbursements"("reimbursementId", "msku", "fnsku");

CREATE UNIQUE INDEX "fba_removals_orderId_fnsku_requestDate_key" ON "fba_removals"("orderId", "fnsku", "requestDate");

CREATE UNIQUE INDEX "fc_transfers_referenceId_fnsku_transferDate_eventType_fulfillmentCenter_key" ON "fc_transfers"("referenceId", "fnsku", "transferDate", "eventType", "fulfillmentCenter");

CREATE UNIQUE INDEX "shipment_status_shipmentId_key" ON "shipment_status"("shipmentId");

CREATE UNIQUE INDEX "fba_summary_msku_fnsku_disposition_summaryDate_store_key" ON "fba_summary"("msku", "fnsku", "disposition", "summaryDate", "store");

CREATE UNIQUE INDEX "replacements_orderId_msku_replacementOrderId_key" ON "replacements"("orderId", "msku", "replacementOrderId");

CREATE UNIQUE INDEX "adjustments_msku_uploadedAt_key" ON "adjustments"("msku", "uploadedAt");

CREATE UNIQUE INDEX "gnr_report_orderId_fnsku_reportDate_lpn_key" ON "gnr_report"("orderId", "fnsku", "reportDate", "lpn");

CREATE UNIQUE INDEX "payment_repository_settlementId_orderId_sku_lineType_postedDatetime_key" ON "payment_repository"("settlementId", "orderId", "sku", "lineType", "postedDatetime");
