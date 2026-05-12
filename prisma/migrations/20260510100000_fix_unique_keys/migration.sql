-- Align FbaReceipt / FcTransfer unique indexes with schema (fix_unique_keys)

DROP INDEX IF EXISTS "fba_receipts_shipmentId_fnsku_receiptDate_eventType_fulfillmentCenter_key";
DROP INDEX IF EXISTS "fba_receipts_msku_fnsku_receiptDate_fulfillmentCenter_disposition_eventType_key";

DROP INDEX IF EXISTS "fc_transfers_referenceId_fnsku_transferDate_eventType_fulfillmentCenter_key";
DROP INDEX IF EXISTS "fc_transfers_msku_fnsku_transferDate_fulfillmentCenter_eventType_referenceId_key";

DELETE FROM "fba_receipts" a
USING "fba_receipts" b
WHERE a.id > b.id
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku"
  AND a."receiptDate" IS NOT DISTINCT FROM b."receiptDate"
  AND a."shipmentId" IS NOT DISTINCT FROM b."shipmentId";

DELETE FROM "fc_transfers" a
USING "fc_transfers" b
WHERE a.id > b.id
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku"
  AND a."transferDate" IS NOT DISTINCT FROM b."transferDate"
  AND a."referenceId" IS NOT DISTINCT FROM b."referenceId";

CREATE UNIQUE INDEX "fba_receipts_fnsku_receiptDate_shipmentId_key" ON "fba_receipts"("fnsku", "receiptDate", "shipmentId");

CREATE UNIQUE INDEX "fc_transfers_fnsku_transferDate_referenceId_key" ON "fc_transfers"("fnsku", "transferDate", "referenceId");
