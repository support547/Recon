-- ══════════════════════════════════════════════════════════
--  Migration: Add missing columns to fba_receipts table
--  Run in psql:
--  \i 'E:/00 ASHVIN/01 web App/FBA Inventory/migrate_fba_receipts.sql'
-- ══════════════════════════════════════════════════════════

ALTER TABLE fba_receipts ADD COLUMN IF NOT EXISTS event_type        VARCHAR(50);
ALTER TABLE fba_receipts ADD COLUMN IF NOT EXISTS fulfillment_center VARCHAR(20);
ALTER TABLE fba_receipts ADD COLUMN IF NOT EXISTS disposition        VARCHAR(50);
ALTER TABLE fba_receipts ADD COLUMN IF NOT EXISTS reason             TEXT;
ALTER TABLE fba_receipts ADD COLUMN IF NOT EXISTS country            VARCHAR(10);
ALTER TABLE fba_receipts ADD COLUMN IF NOT EXISTS reconciled_qty     INTEGER DEFAULT 0;
ALTER TABLE fba_receipts ADD COLUMN IF NOT EXISTS unreconciled_qty   INTEGER DEFAULT 0;
ALTER TABLE fba_receipts ADD COLUMN IF NOT EXISTS receipt_datetime   TIMESTAMP;
ALTER TABLE fba_receipts ADD COLUMN IF NOT EXISTS store              VARCHAR(100);

-- Change receipt_date to TIMESTAMP for full datetime support
ALTER TABLE fba_receipts ALTER COLUMN receipt_date TYPE TIMESTAMP USING receipt_date::TIMESTAMP;

SELECT 'Migration complete — fba_receipts columns added.' AS status;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'fba_receipts'
ORDER BY ordinal_position;
