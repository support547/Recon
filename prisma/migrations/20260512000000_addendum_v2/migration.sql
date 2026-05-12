-- ==========================================================
-- Addendum v2 — settlement_report + remarks + removal_receipt
-- ==========================================================

-- ----- Replacement composite unique key -----
ALTER TABLE "replacements"
  DROP CONSTRAINT IF EXISTS "replacements_replacementOrderId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "replacements_orderId_msku_replacementOrderId_key"
  ON "replacements" ("orderId", "msku", "replacementOrderId");

-- ----- UploadedFile new fields -----
ALTER TABLE "uploaded_files"
  ADD COLUMN IF NOT EXISTS "data_target_table"  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "report_latest_date" DATE;

-- ----- RemovalReceipt new fields -----
ALTER TABLE "removal_receipts"
  ADD COLUMN IF NOT EXISTS "invoice_number"   VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "reshipped_qty"    INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "item_title"       TEXT,
  ADD COLUMN IF NOT EXISTS "bin_location"     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "attachment_urls"  JSONB;

-- ----- Full Recon Remarks -----
CREATE TABLE IF NOT EXISTS "full_recon_remarks" (
  "fnsku"      TEXT PRIMARY KEY,
  "remarks"    TEXT,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----- GNR Recon Remarks -----
CREATE TABLE IF NOT EXISTS "gnr_recon_remarks" (
  "used_msku"  TEXT NOT NULL,
  "used_fnsku" TEXT NOT NULL,
  "remarks"    TEXT,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "gnr_recon_remarks_pkey" PRIMARY KEY ("used_msku", "used_fnsku")
);

-- ----- Settlement Report -----
CREATE TABLE IF NOT EXISTS "settlement_report" (
  "id"                          TEXT PRIMARY KEY,
  "settlement_id"               TEXT,
  "settlement_start_date"       TEXT,
  "settlement_end_date"         TEXT,
  "deposit_date"                TEXT,
  "total_amount"                DECIMAL(14,4),
  "currency"                    TEXT,
  "transaction_type"            TEXT,
  "order_id"                    TEXT,
  "merchant_order_id"           TEXT,
  "adjustment_id"               TEXT,
  "shipment_id"                 TEXT,
  "marketplace_name"            TEXT,
  "amount_type"                 TEXT,
  "amount_description"          TEXT,
  "amount"                      DECIMAL(14,4),
  "fulfillment_id"              TEXT,
  "posted_date"                 TEXT,
  "posted_date_time"            TEXT,
  "order_item_code"             TEXT,
  "merchant_order_item_id"      TEXT,
  "merchant_adjustment_item_id" TEXT,
  "sku"                         TEXT,
  "quantity_purchased"          INT,
  "promotion_id"                TEXT,
  "store"                       TEXT,
  "uploaded_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                   TIMESTAMP(3) NOT NULL,
  "deletedAt"                   TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "settlement_report_settlement_id_idx" ON "settlement_report" ("settlement_id");
CREATE INDEX IF NOT EXISTS "settlement_report_transaction_type_idx" ON "settlement_report" ("transaction_type");
CREATE INDEX IF NOT EXISTS "settlement_report_order_id_idx" ON "settlement_report" ("order_id");
CREATE INDEX IF NOT EXISTS "settlement_report_sku_idx" ON "settlement_report" ("sku");
CREATE INDEX IF NOT EXISTS "settlement_report_posted_date_idx" ON "settlement_report" ("posted_date");
CREATE INDEX IF NOT EXISTS "settlement_report_store_idx" ON "settlement_report" ("store");
