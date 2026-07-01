-- Step 1: collapse existing duplicates, keeping the OLDEST (earliest createdAt)
-- live row per shipmentId. Newer duplicate live rows are soft-deleted so the
-- partial unique index below can be created without a constraint violation.
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "shipmentId"
           ORDER BY "createdAt" ASC, "id" ASC
         ) AS rn
  FROM "inbound_shipments"
  WHERE "deletedAt" IS NULL
)
UPDATE "inbound_shipments" s
SET "deletedAt" = NOW()
FROM ranked r
WHERE s."id" = r."id"
  AND r.rn > 1;

-- Step 2: enforce uniqueness across LIVE rows only. Soft-deleted rows
-- (deletedAt IS NOT NULL) are excluded so a shipment can be re-added after
-- being deleted.
CREATE UNIQUE INDEX "inbound_shipments_shipmentId_live_key"
  ON "inbound_shipments" ("shipmentId")
  WHERE "deletedAt" IS NULL;
