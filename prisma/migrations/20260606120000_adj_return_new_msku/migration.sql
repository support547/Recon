-- Add the RETURN_NEW_MSKU adjustment type (return came back under a new MSKU).
ALTER TYPE "AdjType" ADD VALUE IF NOT EXISTS 'RETURN_NEW_MSKU';

-- Original MSKU the unit was listed/sold under before returning under a new MSKU.
ALTER TABLE "manual_adjustments" ADD COLUMN IF NOT EXISTS "original_msku" TEXT;
