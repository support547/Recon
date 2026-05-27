-- Prior migration tried DROP CONSTRAINT — fails silently because index, not constraint.
DROP INDEX IF EXISTS "sales_data_orderId_fnsku_saleDate_key";
