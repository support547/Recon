-- Shipment status is a per-shipment snapshot: each Shipment ID must appear
-- once, holding the latest status / units / dates. Re-uploading a shipment
-- updates that single row (handled app-side in processShipmentStatus) rather
-- than appending a duplicate. Re-add the unique that 20260519140000 dropped.
--
-- Duplicates must be removed before this index can be created (see
-- scripts/dedupe-shipment-status.mjs --apply).

-- Drop the now-redundant plain index; the unique index covers it.
DROP INDEX IF EXISTS "shipment_status_shipmentId_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "shipment_status_shipmentId_key"
  ON "shipment_status"("shipmentId");
