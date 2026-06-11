-- FBA Receipts dedup is keyed on rowHash (a SHA-256 of the row's meaningful
-- fields, computed in processReceipts). Re-uploading the same report must skip
-- rows already present rather than appending duplicates. Enforce that at the DB
-- level so concurrent / racing uploads cannot slip past the app-side check.
--
-- Legacy rows had a NULL rowHash and were invisible to the app-side dedup,
-- which produced duplicates. Those were backfilled and deduped before this
-- index can be created (see scripts/backfill-receipt-hashes.mjs --apply).

-- Drop the now-redundant plain index; the unique index covers it.
DROP INDEX IF EXISTS "fba_receipts_rowHash_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "fba_receipts_rowHash_key"
  ON "fba_receipts"("rowHash");
