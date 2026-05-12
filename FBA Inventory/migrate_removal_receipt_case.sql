-- ══════════════════════════════════════════════════════
--  MIGRATION: Add case_id + case_type to removal_receipts
-- ══════════════════════════════════════════════════════

-- Add case linkage to removal_receipts
ALTER TABLE removal_receipts
  ADD COLUMN IF NOT EXISTS case_id         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS case_type       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS case_raised_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS case_tracker_id INT REFERENCES case_tracker(id);

-- Update case_tracker recon_type comment
COMMENT ON COLUMN case_tracker.recon_type IS
  'shipment | removal_recon | return | fc_transfer | reimbursement | other';

-- Verify
SELECT 'removal_receipts updated' AS msg,
  column_name FROM information_schema.columns
  WHERE table_name='removal_receipts'
  AND column_name IN ('case_id','case_type','case_raised_at','case_tracker_id');
