-- InvenSync Local Database Setup
-- Yeh automatically run hoga START.bat se

-- Uploaded files log
CREATE TABLE IF NOT EXISTS uploaded_files (
  id SERIAL PRIMARY KEY,
  report_type VARCHAR(50),
  filename VARCHAR(255),
  row_count INTEGER DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  data_target_table VARCHAR(64),
  report_latest_date DATE
);

-- Shipped to FBA
CREATE TABLE IF NOT EXISTS shipped_to_fba (
  id SERIAL PRIMARY KEY,
  msku VARCHAR(255),
  title TEXT,
  asin VARCHAR(50),
  fnsku VARCHAR(50),
  ship_date DATE,
  quantity INTEGER DEFAULT 0,
  shipment_id VARCHAR(50),
  publisher_name TEXT,
  supplier_name TEXT,
  delivery_location TEXT,
  purchase_id VARCHAR(120),
  final_net_price_usd NUMERIC(12,4),
  commission_usd NUMERIC(12,4),
  supplier_shipping_usd NUMERIC(12,4),
  warehouse_prep_usd NUMERIC(12,4),
  inventory_place_inbound_usd NUMERIC(12,4),
  expert_charges_usd NUMERIC(12,4),
  other_charges_usd NUMERIC(12,4),
  per_book_cost_usd NUMERIC(12,4),
  final_total_purchase_cost_usd NUMERIC(12,4),
  cost_updated_at TIMESTAMPTZ,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Sales Data
CREATE TABLE IF NOT EXISTS sales_data (
  id SERIAL PRIMARY KEY,
  msku VARCHAR(255),
  fnsku VARCHAR(50),
  asin VARCHAR(50),
  quantity INTEGER DEFAULT 0,
  sale_date TIMESTAMP,
  order_id VARCHAR(100),
  currency VARCHAR(10),
  product_amount NUMERIC(12,2) DEFAULT 0,
  shipping_amount NUMERIC(12,2) DEFAULT 0,
  gift_amount NUMERIC(12,2) DEFAULT 0,
  fc VARCHAR(50),
  ship_city VARCHAR(100),
  ship_state VARCHAR(50),
  ship_postal_code VARCHAR(20),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- FBA Receipts
CREATE TABLE IF NOT EXISTS fba_receipts (
  id SERIAL PRIMARY KEY,
  msku VARCHAR(255),
  title TEXT,
  asin VARCHAR(50),
  fnsku VARCHAR(50),
  quantity INTEGER DEFAULT 0,
  receipt_date TIMESTAMP,
  shipment_id VARCHAR(50),
  event_type VARCHAR(50),
  fulfillment_center VARCHAR(20),
  disposition VARCHAR(50),
  reason TEXT,
  country VARCHAR(10),
  reconciled_qty INTEGER DEFAULT 0,
  unreconciled_qty INTEGER DEFAULT 0,
  receipt_datetime TIMESTAMP,
  store VARCHAR(100),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Customer Returns
CREATE TABLE IF NOT EXISTS customer_returns (
  id SERIAL PRIMARY KEY,
  msku VARCHAR(255),
  asin VARCHAR(50),
  fnsku VARCHAR(50),
  title TEXT,
  quantity INTEGER DEFAULT 0,
  disposition VARCHAR(50),
  detailed_disposition VARCHAR(50),
  reason VARCHAR(100),
  status VARCHAR(100),
  return_date TIMESTAMP,
  order_id VARCHAR(100),
  fulfillment_center VARCHAR(20),
  license_plate_number VARCHAR(100),
  customer_comments TEXT,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Reimbursements
CREATE TABLE IF NOT EXISTS reimbursements (
  id SERIAL PRIMARY KEY,
  msku VARCHAR(255),
  fnsku VARCHAR(50),
  asin VARCHAR(50),
  title TEXT,
  reason VARCHAR(100),
  quantity INTEGER DEFAULT 0,
  amount NUMERIC(10,2) DEFAULT 0,
  reimbursement_id VARCHAR(50),
  approval_date TIMESTAMP,
  case_id VARCHAR(50),
  amazon_order_id VARCHAR(100),
  condition_val VARCHAR(50),
  currency VARCHAR(10),
  amount_per_unit NUMERIC(12,2) DEFAULT 0,
  qty_cash INTEGER DEFAULT 0,
  qty_inventory INTEGER DEFAULT 0,
  original_reimb_id VARCHAR(50),
  original_reimb_type VARCHAR(50),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- FBA Removal
CREATE TABLE IF NOT EXISTS fba_removals (
  id SERIAL PRIMARY KEY,
  msku VARCHAR(255),
  fnsku VARCHAR(50),
  quantity INTEGER DEFAULT 0,
  disposition VARCHAR(50),
  order_status VARCHAR(50),
  order_id VARCHAR(100),
  request_date TIMESTAMP,
  order_source VARCHAR(255),
  order_type VARCHAR(50),
  last_updated TIMESTAMP,
  cancelled_qty INTEGER DEFAULT 0,
  disposed_qty INTEGER DEFAULT 0,
  in_process_qty INTEGER DEFAULT 0,
  removal_fee NUMERIC(10,2) DEFAULT 0,
  currency VARCHAR(10),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- FC Transfers
CREATE TABLE IF NOT EXISTS fc_transfers (
  id SERIAL PRIMARY KEY,
  msku VARCHAR(255),
  fnsku VARCHAR(50),
  asin VARCHAR(50),
  title TEXT,
  quantity INTEGER DEFAULT 0,
  transfer_date TIMESTAMP,
  event_type VARCHAR(50),
  reference_id VARCHAR(50),
  fulfillment_center VARCHAR(20),
  disposition VARCHAR(50),
  reason TEXT,
  country VARCHAR(10),
  reconciled_qty INTEGER DEFAULT 0,
  unreconciled_qty INTEGER DEFAULT 0,
  transfer_datetime TIMESTAMP,
  store VARCHAR(100),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Shipment Receiving Status
CREATE TABLE IF NOT EXISTS shipment_status (
  id SERIAL PRIMARY KEY,
  shipment_name VARCHAR(255),
  shipment_id VARCHAR(50),
  created_date DATE,
  last_updated DATE,
  ship_to VARCHAR(20),
  total_skus INTEGER DEFAULT 0,
  units_expected INTEGER DEFAULT 0,
  units_located INTEGER DEFAULT 0,
  status VARCHAR(50),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- FBA Summary (Ending Balance)
CREATE TABLE IF NOT EXISTS fba_summary (
  id SERIAL PRIMARY KEY,
  msku VARCHAR(255),
  fnsku VARCHAR(50),
  asin VARCHAR(50),
  title TEXT,
  disposition VARCHAR(50),
  ending_balance INTEGER DEFAULT 0,
  starting_balance INTEGER DEFAULT 0,
  in_transit INTEGER DEFAULT 0,
  receipts INTEGER DEFAULT 0,
  customer_shipments INTEGER DEFAULT 0,
  customer_returns INTEGER DEFAULT 0,
  vendor_returns INTEGER DEFAULT 0,
  warehouse_transfer INTEGER DEFAULT 0,
  found INTEGER DEFAULT 0,
  lost INTEGER DEFAULT 0,
  damaged INTEGER DEFAULT 0,
  disposed_qty INTEGER DEFAULT 0,
  other_events INTEGER DEFAULT 0,
  unknown_events INTEGER DEFAULT 0,
  location VARCHAR(50),
  store VARCHAR(100),
  summary_date DATE,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Adjustments
CREATE TABLE IF NOT EXISTS adjustments (
  id SERIAL PRIMARY KEY,
  msku VARCHAR(255),
  flag VARCHAR(10),
  quantity INTEGER DEFAULT 0,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Replacements
CREATE TABLE IF NOT EXISTS replacements (
  id SERIAL PRIMARY KEY,
  msku VARCHAR(255),
  order_id VARCHAR(100),
  quantity INTEGER DEFAULT 0,
  uploaded_at TIMESTAMP DEFAULT NOW()
);



-- ============================================
-- UNIQUE CONSTRAINTS for deduplication (run once, safe to re-run)
-- ============================================
ALTER TABLE shipped_to_fba     ADD CONSTRAINT IF NOT EXISTS uq_shipped      UNIQUE (msku, shipment_id);
ALTER TABLE sales_data DROP CONSTRAINT IF EXISTS uq_sales;
ALTER TABLE sales_data ADD CONSTRAINT uq_sales UNIQUE (sale_date, order_id, fc, ship_state, msku, quantity, product_amount);
ALTER TABLE fba_receipts        ADD CONSTRAINT IF NOT EXISTS uq_receipts     UNIQUE (receipt_date, fnsku, shipment_id);
ALTER TABLE customer_returns    ADD CONSTRAINT IF NOT EXISTS uq_returns      UNIQUE (return_date, fnsku, license_plate_number, disposition);
ALTER TABLE reimbursements      ADD CONSTRAINT IF NOT EXISTS uq_reimb        UNIQUE (uploaded_at, reimbursement_id, fnsku);
ALTER TABLE fba_removals        ADD CONSTRAINT IF NOT EXISTS uq_removals     UNIQUE (request_date, order_id, fnsku);
-- fc_transfers: always full replace, no unique constraint needed
ALTER TABLE shipment_status     ADD CONSTRAINT IF NOT EXISTS uq_ship_status  UNIQUE (shipment_id);
ALTER TABLE fba_summary         ADD CONSTRAINT IF NOT EXISTS uq_fba_summary  UNIQUE (summary_date, fnsku, disposition);

-- ============================================
-- CASE TRACKER — Works for ALL reconciliation types
-- ============================================
CREATE TABLE IF NOT EXISTS case_tracker (
  id SERIAL PRIMARY KEY,

  -- Identity
  msku VARCHAR(255) NOT NULL,
  asin VARCHAR(50),
  fnsku VARCHAR(50),
  title TEXT,

  -- Which reconciliation is this case for?
  recon_type VARCHAR(50) NOT NULL,
  -- Values: 'shipment', 'removal', 'return', 'fc_transfer', 'reimbursement', 'other'

  -- Reference IDs
  shipment_id VARCHAR(50),       -- FBA shipment ID if applicable
  order_id    VARCHAR(100),      -- Amazon order ID if applicable
  reference_id VARCHAR(100),     -- Any other reference

  -- Case Details
  case_id     VARCHAR(100),      -- Amazon case ID (filled after raising)
  case_reason VARCHAR(100),      -- e.g. Lost_Inbound, Damaged_Warehouse, etc.
  units_claimed INTEGER DEFAULT 0,   -- How many units claimed
  units_approved INTEGER DEFAULT 0,  -- How many Amazon approved

  -- Financial
  amount_claimed NUMERIC(10,2) DEFAULT 0,
  amount_approved NUMERIC(10,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',

  -- Status tracking
  status VARCHAR(30) DEFAULT 'pending',
  -- Values: 'pending', 'raised', 'approved', 'partial', 'rejected', 'closed'

  -- Dates
  issue_date   DATE,             -- When issue was found
  raised_date  DATE,             -- When case was raised with Amazon
  resolved_date DATE,            -- When Amazon resolved it

  -- Notes
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- MANUAL ADJUSTMENTS — Works for ALL reconciliation types
-- ============================================
CREATE TABLE IF NOT EXISTS manual_adjustments (
  id SERIAL PRIMARY KEY,

  -- Identity
  msku VARCHAR(255) NOT NULL,
  asin VARCHAR(50),
  fnsku VARCHAR(50),
  title TEXT,

  -- Which reconciliation type?
  recon_type VARCHAR(50) NOT NULL,
  -- Values: 'shipment', 'removal', 'return', 'fc_transfer', 'reimbursement', 'fba_balance', 'other'

  -- Reference
  shipment_id  VARCHAR(50),
  order_id     VARCHAR(100),
  reference_id VARCHAR(100),

  -- Adjustment Details
  adj_type VARCHAR(50) NOT NULL,
  -- Values: 'found', 'lost', 'damaged', 'donated', 'correction', 'count_adjustment', 'other'

  qty_before   INTEGER DEFAULT 0,   -- Qty before adjustment
  qty_adjusted INTEGER DEFAULT 0,   -- +/- adjustment (negative = loss)
  qty_after    INTEGER DEFAULT 0,   -- Qty after adjustment

  -- Reason
  reason TEXT NOT NULL,             -- Why this adjustment was made

  -- Verification
  verified_by VARCHAR(100),         -- Who verified this
  source_doc  VARCHAR(255),         -- Supporting document reference

  -- Notes
  notes TEXT,

  adj_date   DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Main reconciliation VIEW
CREATE OR REPLACE VIEW reconciliation_summary AS
SELECT
  all_mskus.msku,
  COALESCE(sh.title, rc.title, fs.title, '') AS title,
  COALESCE(sh.asin,  rc.asin,  fs.asin,  '') AS asin,
  COALESCE(sh.fnsku, rc.fnsku, fs.fnsku, '') AS fnsku,
  COALESCE(sh.total_shipped,   0) AS shipped,
  COALESCE(sl.total_sold,      0) AS sold,
  COALESCE(rc.total_received,  0) AS received,
  COALESCE(rt.total_returns,   0) AS returns,
  COALESCE(ri.total_reimb,     0) AS reimbursements,
  COALESCE(rm.total_removed,   0) AS removals,
  COALESCE(ft.total_fc,        0) AS fc_transfers,
  COALESCE(fs.ending_bal,      0) AS fba_ending_balance,
  -- Expected = Shipped + Received + Returns + Reimb - Sold - Removals
  (COALESCE(sh.total_shipped,0) + COALESCE(rc.total_received,0) +
   COALESCE(rt.total_returns,0) + COALESCE(ri.total_reimb,0) -
   COALESCE(sl.total_sold,0) - COALESCE(rm.total_removed,0)) AS expected_qty,
  -- Actual = FBA Ending Balance (from FBA Summary)
  COALESCE(fs.ending_bal, 0) AS actual_qty,
  -- Variance = Actual - Expected
  COALESCE(fs.ending_bal,0) -
  (COALESCE(sh.total_shipped,0) + COALESCE(rc.total_received,0) +
   COALESCE(rt.total_returns,0) + COALESCE(ri.total_reimb,0) -
   COALESCE(sl.total_sold,0) - COALESCE(rm.total_removed,0)) AS variance,
  CASE
    WHEN ABS(
      COALESCE(fs.ending_bal,0) -
      (COALESCE(sh.total_shipped,0) + COALESCE(rc.total_received,0) +
       COALESCE(rt.total_returns,0) + COALESCE(ri.total_reimb,0) -
       COALESCE(sl.total_sold,0) - COALESCE(rm.total_removed,0))
    ) <= 1 THEN 'matched'
    WHEN COALESCE(fs.ending_bal,0) = 0 AND COALESCE(sh.total_shipped,0) = 0 THEN 'pending'
    ELSE 'mismatch'
  END AS status
FROM (
  SELECT msku FROM shipped_to_fba   WHERE msku IS NOT NULL
  UNION SELECT msku FROM sales_data  WHERE msku IS NOT NULL
  UNION SELECT msku FROM fba_receipts WHERE msku IS NOT NULL
  UNION SELECT msku FROM customer_returns WHERE msku IS NOT NULL
  UNION SELECT msku FROM reimbursements WHERE msku IS NOT NULL
  UNION SELECT msku FROM fba_removals WHERE msku IS NOT NULL
  UNION SELECT msku FROM fc_transfers WHERE msku IS NOT NULL
  UNION SELECT msku FROM fba_summary WHERE msku IS NOT NULL
) all_mskus
LEFT JOIN (SELECT msku, MAX(title) title, MAX(asin) asin, MAX(fnsku) fnsku, SUM(quantity) total_shipped FROM shipped_to_fba GROUP BY msku) sh ON sh.msku = all_mskus.msku
LEFT JOIN (SELECT msku, SUM(quantity) total_sold FROM sales_data GROUP BY msku) sl ON sl.msku = all_mskus.msku
LEFT JOIN (SELECT msku, MAX(title) title, MAX(asin) asin, MAX(fnsku) fnsku, SUM(quantity) total_received FROM fba_receipts GROUP BY msku) rc ON rc.msku = all_mskus.msku
LEFT JOIN (SELECT msku, SUM(quantity) total_returns FROM customer_returns GROUP BY msku) rt ON rt.msku = all_mskus.msku
LEFT JOIN (SELECT msku, SUM(quantity) total_reimb FROM reimbursements GROUP BY msku) ri ON ri.msku = all_mskus.msku
LEFT JOIN (SELECT msku, SUM(quantity) total_removed FROM fba_removals GROUP BY msku) rm ON rm.msku = all_mskus.msku
LEFT JOIN (SELECT msku, MAX(title) title, MAX(asin) asin, MAX(fnsku) fnsku, SUM(quantity) total_fc FROM fc_transfers GROUP BY msku) ft ON ft.msku = all_mskus.msku
LEFT JOIN (SELECT msku, MAX(title) title, MAX(asin) asin, MAX(fnsku) fnsku, SUM(ending_balance) ending_bal FROM fba_summary WHERE disposition='SELLABLE' GROUP BY msku) fs ON fs.msku = all_mskus.msku;

SELECT 'Database setup complete!' AS result;

-- ══════════════════════════════════════════════════════
--  REMOVAL SHIPMENTS (Amazon Shipment Detail Report)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS removal_shipments (
  id               SERIAL PRIMARY KEY,
  order_id         VARCHAR(50)   NOT NULL,
  request_date     TIMESTAMP,
  shipment_date    TIMESTAMP,
  msku             VARCHAR(255),
  fnsku            VARCHAR(50),
  disposition      VARCHAR(50),
  shipped_qty      INT           DEFAULT 0,
  carrier          VARCHAR(100),
  tracking_number  VARCHAR(100),
  removal_order_type VARCHAR(50),
  uploaded_at      TIMESTAMP     DEFAULT NOW(),
  UNIQUE(order_id, fnsku, tracking_number)
);

-- ══════════════════════════════════════════════════════
--  REMOVAL RECEIPTS (Manual Warehouse Receiving Log)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS removal_receipts (
  id                SERIAL PRIMARY KEY,

  -- Link to Amazon data
  order_id          VARCHAR(50)   NOT NULL,
  fnsku             VARCHAR(50),
  msku              VARCHAR(255),
  tracking_number   VARCHAR(100),
  carrier           VARCHAR(100),

  -- Expected (from Shipment Detail)
  expected_qty      INT           DEFAULT 0,

  -- Actual receiving
  received_date     DATE,
  received_qty      INT           DEFAULT 0,
  sellable_qty      INT           DEFAULT 0,
  unsellable_qty    INT           DEFAULT 0,

  -- Condition
  -- Good / Sellable | Damaged / Unsellable | Missing | Partial
  condition_received VARCHAR(50)  DEFAULT 'Pending',

  -- Derived (can be computed but stored for easy querying)
  missing_qty       INT           GENERATED ALWAYS AS
                    (GREATEST(expected_qty - received_qty, 0)) STORED,

  -- Notes
  notes             TEXT,
  received_by       VARCHAR(100),

  -- Status: Pending | Received | Partial | Disputed | Missing
  status            VARCHAR(30)   DEFAULT 'Pending',

  -- Warehouse fields
  warehouse_comment TEXT,
  transfer_to       VARCHAR(100),
  reshipped_qty     INT           DEFAULT 0,
  wh_status         VARCHAR(50)   DEFAULT 'Pending',

  item_title        TEXT,
  bin_location      VARCHAR(100),

  -- Warehouse billing (Inv. # in Receipts Log)
  invoice_number    VARCHAR(120),

  attachment_urls   JSONB         DEFAULT '[]'::jsonb,

  created_at        TIMESTAMP     DEFAULT NOW(),
  updated_at        TIMESTAMP     DEFAULT NOW(),

  UNIQUE(order_id, fnsku, tracking_number)
);

-- Payment Repository (Amazon Payment / Transaction style report)
CREATE TABLE IF NOT EXISTS payment_repository (
  id                           SERIAL PRIMARY KEY,
  posted_datetime              TEXT,
  settlement_id                VARCHAR(100),
  line_type                    VARCHAR(200),
  order_id                     VARCHAR(100),
  sku                          VARCHAR(200),
  description                  TEXT,
  quantity                     INT             DEFAULT 0,
  marketplace                  VARCHAR(50),
  account_type                 VARCHAR(100),
  fulfillment                  VARCHAR(200),
  order_city                   VARCHAR(100),
  order_state                  VARCHAR(100),
  order_postal                 VARCHAR(30),
  tax_collection_model         VARCHAR(100),
  product_sales                NUMERIC(14,4),
  product_sales_tax            NUMERIC(14,4),
  shipping_credits             NUMERIC(14,4),
  shipping_credits_tax         NUMERIC(14,4),
  gift_wrap_credits            NUMERIC(14,4),
  gift_wrap_credits_tax        NUMERIC(14,4),
  regulatory_fee               NUMERIC(14,4),
  tax_on_regulatory_fee        NUMERIC(14,4),
  promotional_rebates          NUMERIC(14,4),
  promotional_rebates_tax      NUMERIC(14,4),
  marketplace_withheld_tax     NUMERIC(14,4),
  selling_fees                 NUMERIC(14,4),
  fba_fees                     NUMERIC(14,4),
  other_transaction_fees       NUMERIC(14,4),
  other_amount                 NUMERIC(14,4),
  total_amount                 NUMERIC(14,4),
  transaction_status           VARCHAR(100),
  transaction_release_datetime TEXT,
  uploaded_at                  TIMESTAMPTZ     DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gnr_recon_remarks (
  used_msku  VARCHAR(512) NOT NULL,
  used_fnsku VARCHAR(512) NOT NULL,
  remarks    TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (used_msku, used_fnsku)
);

CREATE TABLE IF NOT EXISTS full_recon_remarks (
  fnsku      VARCHAR(256) NOT NULL PRIMARY KEY,
  remarks    TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
