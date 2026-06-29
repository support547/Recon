-- Add regulatory fee columns to payment_repository (new Amazon Unified
-- Transaction CSV format, effective 2026). Both nullable so historical
-- rows remain valid.
ALTER TABLE "payment_repository"
  ADD COLUMN IF NOT EXISTS "regulatoryFee" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "taxOnRegulatoryFee" DECIMAL(12, 2);
