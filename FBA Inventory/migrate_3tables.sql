-- ══════════════════════════════════════════════════════════
--  Migration: Add missing columns to customer_returns,
--             reimbursements, fc_transfers
--  Run in psql ONE LINE AT A TIME or paste full block:
--  \i 'E:/00 ASHVIN/01 web App/FBA Inventory/migrate_3tables.sql'
-- ══════════════════════════════════════════════════════════

-- ── CUSTOMER RETURNS (missing: order_id, fulfillment_center, detailed_disposition, status, customer_comments) ──
ALTER TABLE customer_returns ADD COLUMN IF NOT EXISTS order_id             VARCHAR(100);
ALTER TABLE customer_returns ADD COLUMN IF NOT EXISTS fulfillment_center   VARCHAR(20);
ALTER TABLE customer_returns ADD COLUMN IF NOT EXISTS detailed_disposition VARCHAR(50);
ALTER TABLE customer_returns ADD COLUMN IF NOT EXISTS status               VARCHAR(100);
ALTER TABLE customer_returns ADD COLUMN IF NOT EXISTS customer_comments    TEXT;
ALTER TABLE customer_returns ALTER COLUMN return_date TYPE TIMESTAMP USING return_date::TIMESTAMP;

-- ── REIMBURSEMENTS (missing: case_id, amazon_order_id, condition_val, currency, amount_per_unit, qty_cash, qty_inventory, orig_reimb_id, orig_reimb_type) ──
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS approval_date         TIMESTAMP;
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS case_id               VARCHAR(50);
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS amazon_order_id       VARCHAR(100);
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS condition_val         VARCHAR(50);
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS currency              VARCHAR(10);
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS amount_per_unit       NUMERIC(12,2) DEFAULT 0;
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS qty_cash              INTEGER DEFAULT 0;
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS qty_inventory         INTEGER DEFAULT 0;
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS original_reimb_id     VARCHAR(50);
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS original_reimb_type   VARCHAR(50);

-- ── FC TRANSFERS (missing: event_type, reference_id, fulfillment_center, disposition, reason, country, reconciled_qty, unreconciled_qty, transfer_datetime, store) ──
ALTER TABLE fc_transfers ADD COLUMN IF NOT EXISTS event_type         VARCHAR(50);
ALTER TABLE fc_transfers ADD COLUMN IF NOT EXISTS reference_id       VARCHAR(50);
ALTER TABLE fc_transfers ADD COLUMN IF NOT EXISTS fulfillment_center VARCHAR(20);
ALTER TABLE fc_transfers ADD COLUMN IF NOT EXISTS disposition        VARCHAR(50);
ALTER TABLE fc_transfers ADD COLUMN IF NOT EXISTS reason             TEXT;
ALTER TABLE fc_transfers ADD COLUMN IF NOT EXISTS country            VARCHAR(10);
ALTER TABLE fc_transfers ADD COLUMN IF NOT EXISTS reconciled_qty     INTEGER DEFAULT 0;
ALTER TABLE fc_transfers ADD COLUMN IF NOT EXISTS unreconciled_qty   INTEGER DEFAULT 0;
ALTER TABLE fc_transfers ADD COLUMN IF NOT EXISTS transfer_datetime  TIMESTAMP;
ALTER TABLE fc_transfers ADD COLUMN IF NOT EXISTS store              VARCHAR(100);
ALTER TABLE fc_transfers ALTER COLUMN transfer_date TYPE TIMESTAMP USING transfer_date::TIMESTAMP;

SELECT 'Migration complete — all 3 tables updated.' AS status;

-- Verify
SELECT 'customer_returns' tbl, column_name FROM information_schema.columns WHERE table_name='customer_returns' ORDER BY ordinal_position
UNION ALL
SELECT 'reimbursements', column_name FROM information_schema.columns WHERE table_name='reimbursements' ORDER BY ordinal_position
UNION ALL
SELECT 'fc_transfers', column_name FROM information_schema.columns WHERE table_name='fc_transfers' ORDER BY ordinal_position;
