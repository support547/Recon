-- Align unique indexes with prisma/schema.prisma so ON CONFLICT ("orderId", "saleDate") etc. work.

DROP INDEX IF EXISTS "sales_data_orderId_msku_fnsku_saleDate_key";

DELETE FROM "sales_data" a
USING "sales_data" b
WHERE a.id > b.id
  AND a."orderId" IS NOT DISTINCT FROM b."orderId"
  AND a."saleDate" IS NOT DISTINCT FROM b."saleDate";

CREATE UNIQUE INDEX "sales_data_orderId_saleDate_key" ON "sales_data"("orderId", "saleDate");

DROP INDEX IF EXISTS "customer_returns_orderId_fnsku_returnDate_licensePlateNumber_key";

DELETE FROM "customer_returns" a
USING "customer_returns" b
WHERE a.id > b.id
  AND a."orderId" IS NOT DISTINCT FROM b."orderId"
  AND a."fnsku" IS NOT DISTINCT FROM b."fnsku"
  AND a."returnDate" IS NOT DISTINCT FROM b."returnDate";

CREATE UNIQUE INDEX "customer_returns_orderId_fnsku_returnDate_key" ON "customer_returns"("orderId", "fnsku", "returnDate");
