-- Migration: sales_data natural key = (sale_date, order_id, fc, ship_state, msku).
-- msku is required so each order line (SKU) is stored; date+order+fc+state alone collapses multi-SKU orders.
-- Auto-migrate on server start also runs (server.js); use this file for manual psql runs.

BEGIN;

UPDATE sales_data SET fc = COALESCE(fc, ''), ship_state = COALESCE(ship_state, '');

DELETE FROM sales_data a
USING sales_data b
WHERE a.id < b.id
  AND a.sale_date IS NOT DISTINCT FROM b.sale_date
  AND COALESCE(a.order_id, '') = COALESCE(b.order_id, '')
  AND COALESCE(a.fc, '') = COALESCE(b.fc, '')
  AND COALESCE(a.ship_state, '') = COALESCE(b.ship_state, '')
  AND COALESCE(a.msku, '') = COALESCE(b.msku, '');

ALTER TABLE sales_data DROP CONSTRAINT IF EXISTS uq_sales;
ALTER TABLE sales_data ADD CONSTRAINT uq_sales UNIQUE (sale_date, order_id, fc, ship_state, msku);

COMMIT;
