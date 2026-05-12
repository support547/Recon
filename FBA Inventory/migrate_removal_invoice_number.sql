-- Invoice # column for Removal Recon → Receipts Log (warehouse billing)
-- Safe to run multiple times.

ALTER TABLE removal_receipts
  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(120);

SELECT 'removal_receipts.invoice_number OK' AS msg
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'removal_receipts' AND column_name = 'invoice_number'
  );
