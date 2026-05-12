-- ══════════════════════════════════════════════════════════
--  Migration: Add missing columns to sales_data table
--  Run this ONCE in psql:
--  \i 'E:/00 ASHVIN/01 web App/FBA Inventory/migrate_sales_data.sql'
-- ══════════════════════════════════════════════════════════

ALTER TABLE sales_data ADD COLUMN IF NOT EXISTS currency        VARCHAR(10);
ALTER TABLE sales_data ADD COLUMN IF NOT EXISTS product_amount  NUMERIC(12,2) DEFAULT 0;
ALTER TABLE sales_data ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE sales_data ADD COLUMN IF NOT EXISTS gift_amount     NUMERIC(12,2) DEFAULT 0;
ALTER TABLE sales_data ADD COLUMN IF NOT EXISTS fc              VARCHAR(50);
ALTER TABLE sales_data ADD COLUMN IF NOT EXISTS ship_city       VARCHAR(100);
ALTER TABLE sales_data ADD COLUMN IF NOT EXISTS ship_state      VARCHAR(50);
ALTER TABLE sales_data ADD COLUMN IF NOT EXISTS ship_postal_code VARCHAR(20);

-- Also change sale_date to TIMESTAMP to store full datetime from Amazon
ALTER TABLE sales_data ALTER COLUMN sale_date TYPE TIMESTAMP USING sale_date::TIMESTAMP;

SELECT 'Migration complete. Columns added to sales_data.' AS status;

-- Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sales_data' 
ORDER BY ordinal_position;
