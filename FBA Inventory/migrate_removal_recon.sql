-- ══════════════════════════════════════════════════════
--  MIGRATION: Removal Reconciliation Tables
--  Run this in psql to add new tables
-- ══════════════════════════════════════════════════════

-- TABLE 1: removal_shipments (Amazon Shipment Detail)
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

-- TABLE 2: removal_receipts (Manual Warehouse Receiving)
CREATE TABLE IF NOT EXISTS removal_receipts (
  id                SERIAL PRIMARY KEY,
  order_id          VARCHAR(50)   NOT NULL,
  fnsku             VARCHAR(50),
  msku              VARCHAR(255),
  tracking_number   VARCHAR(100),
  carrier           VARCHAR(100),
  expected_qty      INT           DEFAULT 0,
  received_date     DATE,
  received_qty      INT           DEFAULT 0,
  sellable_qty      INT           DEFAULT 0,
  unsellable_qty    INT           DEFAULT 0,
  condition_received VARCHAR(50)  DEFAULT 'Pending',
  missing_qty       INT           GENERATED ALWAYS AS
                    (GREATEST(expected_qty - received_qty, 0)) STORED,
  notes             TEXT,
  received_by       VARCHAR(100),
  status            VARCHAR(30)   DEFAULT 'Pending',
  created_at        TIMESTAMP     DEFAULT NOW(),
  updated_at        TIMESTAMP     DEFAULT NOW(),
  UNIQUE(order_id, fnsku, tracking_number)
);

-- Verify
SELECT 'removal_shipments created' AS msg FROM information_schema.tables
  WHERE table_name = 'removal_shipments';
SELECT 'removal_receipts created' AS msg FROM information_schema.tables
  WHERE table_name = 'removal_receipts';
