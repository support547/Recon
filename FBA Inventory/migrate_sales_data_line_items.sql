-- Multiple Customer Shipment lines per (order_id, MSKU) differ by quantity / product amount.
-- Extend uq_sales so each line is stored; re-upload of the same line still upserts (no duplicate).
-- Safe to run once; server.js ensureSalesUqConstraint() also applies this on startup.

UPDATE sales_data SET fc = COALESCE(fc, ''), ship_state = COALESCE(ship_state, '');
UPDATE sales_data SET quantity = COALESCE(quantity, 0), product_amount = COALESCE(product_amount, 0);

DELETE FROM sales_data a
USING sales_data b
WHERE a.id < b.id
  AND a.sale_date IS NOT DISTINCT FROM b.sale_date
  AND COALESCE(a.order_id, '') = COALESCE(b.order_id, '')
  AND COALESCE(a.fc, '') = COALESCE(b.fc, '')
  AND COALESCE(a.ship_state, '') = COALESCE(b.ship_state, '')
  AND COALESCE(a.msku, '') = COALESCE(b.msku, '')
  AND COALESCE(a.quantity, 0) = COALESCE(b.quantity, 0)
  AND COALESCE(a.product_amount, 0) = COALESCE(b.product_amount, 0);

ALTER TABLE sales_data DROP CONSTRAINT IF EXISTS uq_sales;
ALTER TABLE sales_data ADD CONSTRAINT uq_sales
  UNIQUE (sale_date, order_id, fc, ship_state, msku, quantity, product_amount);
