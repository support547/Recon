-- ══════════════════════════════════════════════════════
--  MIGRATION: Add post-receipt action columns
-- ══════════════════════════════════════════════════════

ALTER TABLE removal_receipts
  ADD COLUMN IF NOT EXISTS reimb_qty        INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimb_amount     NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_action      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS action_remarks   TEXT,
  ADD COLUMN IF NOT EXISTS action_date      DATE,
  ADD COLUMN IF NOT EXISTS final_status     VARCHAR(50) DEFAULT 'Pending Action';

-- post_action values:
-- 'Resell Ready' | 'Reshipped to FBA' | 'Disposed' | 'Restricted by FBA'
-- 'Local Sale' | 'Reimbursed' | 'Case Pending' | 'Donated'

-- final_status values:
-- 'Pending Action' | 'Resell Ready' | 'Reshipped to FBA' | 'Disposed'
-- 'Restricted by FBA' | 'Local Sale' | 'Reimbursed' | 'Case Pending' | 'Donated'

SELECT 'removal_receipts updated' AS msg;
