-- ================================================================
-- MIGRATION: Deduplication Upgrade
-- Run ONCE on existing database before using new server.js
--
-- Command (Windows):
-- "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d invensync -f add_unique_constraints.sql
-- ================================================================

-- STEP 1: Rename shipment_receiving to shipment_status
ALTER TABLE IF EXISTS shipment_receiving RENAME TO shipment_status;

-- STEP 2: Add missing columns
ALTER TABLE customer_returns ADD COLUMN IF NOT EXISTS return_date          DATE;
ALTER TABLE customer_returns ADD COLUMN IF NOT EXISTS license_plate_number VARCHAR(100) DEFAULT '';
ALTER TABLE fba_removals     ADD COLUMN IF NOT EXISTS order_id             VARCHAR(100) DEFAULT '';

-- STEP 3: Remove old wrong constraints (safe if they don't exist)
ALTER TABLE shipped_to_fba   DROP CONSTRAINT IF EXISTS uq_shipped;
ALTER TABLE sales_data        DROP CONSTRAINT IF EXISTS uq_sales;
ALTER TABLE fba_receipts      DROP CONSTRAINT IF EXISTS uq_receipts;
ALTER TABLE customer_returns  DROP CONSTRAINT IF EXISTS uq_returns;
ALTER TABLE reimbursements    DROP CONSTRAINT IF EXISTS uq_reimb;
ALTER TABLE fba_removals      DROP CONSTRAINT IF EXISTS uq_removals;
ALTER TABLE fc_transfers      DROP CONSTRAINT IF EXISTS uq_fc;
ALTER TABLE shipment_status   DROP CONSTRAINT IF EXISTS uq_ship_recv;
ALTER TABLE shipment_status   DROP CONSTRAINT IF EXISTS uq_ship_status;
ALTER TABLE fba_summary       DROP CONSTRAINT IF EXISTS uq_fba_summary;

-- STEP 4: Clean existing duplicate rows (keep newest per unique key)
DELETE FROM shipped_to_fba
  WHERE id NOT IN (SELECT MAX(id) FROM shipped_to_fba GROUP BY msku, shipment_id);

DELETE FROM sales_data
  WHERE id NOT IN (SELECT MAX(id) FROM sales_data
    GROUP BY sale_date, COALESCE(order_id,''), COALESCE(fc,''), COALESCE(ship_state,''), COALESCE(msku,''),
             COALESCE(quantity,0), COALESCE(product_amount,0));

DELETE FROM fba_receipts
  WHERE id NOT IN (SELECT MAX(id) FROM fba_receipts GROUP BY receipt_date, fnsku, COALESCE(shipment_id,''));

DELETE FROM customer_returns
  WHERE id NOT IN (SELECT MAX(id) FROM customer_returns
    GROUP BY COALESCE(return_date, uploaded_at::date), fnsku,
             COALESCE(license_plate_number,''), COALESCE(disposition,''));

DELETE FROM reimbursements
  WHERE id NOT IN (SELECT MAX(id) FROM reimbursements
    GROUP BY COALESCE(reimbursement_id,''), fnsku);

DELETE FROM fba_removals
  WHERE id NOT IN (SELECT MAX(id) FROM fba_removals
    GROUP BY COALESCE(request_date, uploaded_at::date), COALESCE(order_id,''), fnsku);

DELETE FROM fba_summary
  WHERE id NOT IN (SELECT MAX(id) FROM fba_summary
    GROUP BY COALESCE(summary_date, uploaded_at::date), fnsku, COALESCE(disposition,''));

DELETE FROM shipment_status
  WHERE id NOT IN (SELECT MAX(id) FROM shipment_status GROUP BY shipment_id);

-- STEP 5: Add UNIQUE constraints
ALTER TABLE shipped_to_fba   ADD CONSTRAINT uq_shipped      UNIQUE (msku, shipment_id);
ALTER TABLE sales_data        ADD CONSTRAINT uq_sales        UNIQUE (sale_date, order_id, fc, ship_state, msku, quantity, product_amount);
ALTER TABLE fba_receipts      ADD CONSTRAINT uq_receipts     UNIQUE (receipt_date, fnsku, shipment_id);
ALTER TABLE customer_returns  ADD CONSTRAINT uq_returns      UNIQUE (return_date, fnsku, license_plate_number, disposition);
ALTER TABLE reimbursements    ADD CONSTRAINT uq_reimb        UNIQUE (reimbursement_id, fnsku);
ALTER TABLE fba_removals      ADD CONSTRAINT uq_removals     UNIQUE (request_date, order_id, fnsku);
ALTER TABLE shipment_status   ADD CONSTRAINT uq_ship_status  UNIQUE (shipment_id);
ALTER TABLE fba_summary       ADD CONSTRAINT uq_fba_summary  UNIQUE (summary_date, fnsku, disposition);
-- fc_transfers has NO unique constraint - always full replace on upload

-- STEP 6: Confirm (should show 8 rows)
SELECT tc.table_name, tc.constraint_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS unique_columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
  AND tc.table_name IN ('shipped_to_fba','sales_data','fba_receipts','customer_returns',
                        'reimbursements','fba_removals','shipment_status','fba_summary')
GROUP BY tc.table_name, tc.constraint_name ORDER BY tc.table_name;
