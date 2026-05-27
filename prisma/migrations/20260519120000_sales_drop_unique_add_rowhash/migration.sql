-- Drop composite unique on sales_data to allow intra-file duplicates.
-- Idempotency now enforced app-side via rowHash.
-- Note: previously created as UNIQUE INDEX, not constraint — use DROP INDEX.
DROP INDEX IF EXISTS "sales_data_orderId_fnsku_saleDate_key";
ALTER TABLE "sales_data" DROP CONSTRAINT IF EXISTS "sales_data_orderId_fnsku_saleDate_key";

ALTER TABLE "sales_data" ADD COLUMN IF NOT EXISTS "rowHash" TEXT;

CREATE INDEX IF NOT EXISTS "sales_data_rowHash_idx" ON "sales_data"("rowHash");
