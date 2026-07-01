-- Bank reconciliation surface. Creates enums, bank_transactions table,
-- supporting indexes, and the partial unique index that enforces 1:1
-- between a live bank line and a settlement. Idempotent so re-runs on
-- environments where the earlier placeholder migration created partial
-- state are harmless.

DO $$ BEGIN
  CREATE TYPE "BankTxnDirection" AS ENUM ('CREDIT', 'DEBIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BankSourceCategory" AS ENUM (
    'USA_PAYOUT', 'CA_PAYOUT', 'MX_PAYOUT', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BankMatchStatus" AS ENUM (
    'UNMATCHED', 'MATCHED', 'DISCREPANCY'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "bank_transactions" (
  "id"                     TEXT PRIMARY KEY,
  "txn_date"               TIMESTAMP(3) NOT NULL,
  "description"            TEXT,
  "amount_usd"             DECIMAL(14, 4) NOT NULL,
  "direction"              "BankTxnDirection" NOT NULL,
  "source_category"        "BankSourceCategory" NOT NULL,
  "detected_store"         TEXT,
  "detected_currency"      TEXT,
  "matchable"              BOOLEAN NOT NULL DEFAULT FALSE,
  "matched_settlement_id"  TEXT,
  "match_status"           "BankMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "settlement_expected"    DECIMAL(14, 4),
  "variance_usd"           DECIMAL(14, 4),
  "implied_fx_rate"        DECIMAL(18, 8),
  "bank_reference"         TEXT,
  "notes"                  TEXT,
  "import_batch_id"        TEXT,
  "row_hash"               TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  "deletedAt"              TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "bank_transactions_txn_date_idx"           ON "bank_transactions" ("txn_date");
CREATE INDEX IF NOT EXISTS "bank_transactions_match_status_idx"       ON "bank_transactions" ("match_status");
CREATE INDEX IF NOT EXISTS "bank_transactions_matched_settlement_idx" ON "bank_transactions" ("matched_settlement_id");
CREATE INDEX IF NOT EXISTS "bank_transactions_direction_idx"          ON "bank_transactions" ("direction");
CREATE INDEX IF NOT EXISTS "bank_transactions_source_category_idx"    ON "bank_transactions" ("source_category");
CREATE INDEX IF NOT EXISTS "bank_transactions_row_hash_idx"           ON "bank_transactions" ("row_hash");

-- Enforce 1:1 across LIVE (non-soft-deleted) rows only. Soft-deleted
-- rows are excluded so an accidentally deleted match can be recreated,
-- and NULL matched_settlement_id is also excluded so unmatched lines
-- don't collide with one another.
CREATE UNIQUE INDEX IF NOT EXISTS "bank_transactions_matched_settlement_live_key"
  ON "bank_transactions" ("matched_settlement_id")
  WHERE "deletedAt" IS NULL AND "matched_settlement_id" IS NOT NULL;
