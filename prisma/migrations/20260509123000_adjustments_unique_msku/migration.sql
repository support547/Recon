-- Drop old compound unique (msku + uploadedAt)
DROP INDEX IF EXISTS "adjustments_msku_uploadedAt_key";

-- Keep one row per MSKU (oldest id wins); re-home quantities onto the survivor
WITH agg AS (
  SELECT "msku", SUM("quantity")::int AS qty
  FROM "adjustments"
  GROUP BY "msku"
),
keeper AS (
  SELECT DISTINCT ON ("msku") "id", "msku"
  FROM "adjustments"
  ORDER BY "msku", "id" ASC
)
UPDATE "adjustments" a
SET "quantity" = agg.qty
FROM agg
JOIN keeper k ON k."msku" = agg."msku"
WHERE a."id" = k."id";

DELETE FROM "adjustments" a
USING "adjustments" b
WHERE a."msku" = b."msku" AND a."id" > b."id";

CREATE UNIQUE INDEX "adjustments_msku_key" ON "adjustments"("msku");
