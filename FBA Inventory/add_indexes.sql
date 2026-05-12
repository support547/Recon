-- InvenSync ERP — Performance Indexes
-- Yeh file manually run kar sakte hain: psql -d invensync -f add_indexes.sql
-- Ya automatically server start pe runAutoMigrations() se apply ho jata hai.
-- Sab "IF NOT EXISTS" hain — safe to re-run.

-- ── shipped_to_fba ──
CREATE INDEX IF NOT EXISTS idx_shipped_msku        ON shipped_to_fba (msku);
CREATE INDEX IF NOT EXISTS idx_shipped_shipment_id ON shipped_to_fba (shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipped_ship_date   ON shipped_to_fba (ship_date);

-- ── sales_data ──
CREATE INDEX IF NOT EXISTS idx_sales_msku          ON sales_data (msku);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date     ON sales_data (sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_order_id      ON sales_data (order_id);
CREATE INDEX IF NOT EXISTS idx_sales_asin          ON sales_data (asin);
CREATE INDEX IF NOT EXISTS idx_sales_fnsku         ON sales_data (fnsku);
CREATE INDEX IF NOT EXISTS idx_sales_msku_date     ON sales_data (msku, sale_date);

-- ── fba_receipts ──
CREATE INDEX IF NOT EXISTS idx_receipts_msku       ON fba_receipts (msku);
CREATE INDEX IF NOT EXISTS idx_receipts_fnsku      ON fba_receipts (fnsku);
CREATE INDEX IF NOT EXISTS idx_receipts_shipment   ON fba_receipts (shipment_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date       ON fba_receipts (receipt_date);
CREATE INDEX IF NOT EXISTS idx_receipts_msku_ship  ON fba_receipts (msku, shipment_id);

-- ── customer_returns ──
CREATE INDEX IF NOT EXISTS idx_returns_msku        ON customer_returns (msku);
CREATE INDEX IF NOT EXISTS idx_returns_fnsku       ON customer_returns (fnsku);
CREATE INDEX IF NOT EXISTS idx_returns_date        ON customer_returns (return_date);
CREATE INDEX IF NOT EXISTS idx_returns_asin        ON customer_returns (asin);

-- ── reimbursements ──
CREATE INDEX IF NOT EXISTS idx_reimb_msku          ON reimbursements (msku);
CREATE INDEX IF NOT EXISTS idx_reimb_fnsku         ON reimbursements (fnsku);
CREATE INDEX IF NOT EXISTS idx_reimb_asin          ON reimbursements (asin);

-- ── fba_removals ──
CREATE INDEX IF NOT EXISTS idx_removals_msku       ON fba_removals (msku);
CREATE INDEX IF NOT EXISTS idx_removals_fnsku      ON fba_removals (fnsku);
CREATE INDEX IF NOT EXISTS idx_removals_order_id   ON fba_removals (order_id);
CREATE INDEX IF NOT EXISTS idx_removals_date       ON fba_removals (request_date);
CREATE INDEX IF NOT EXISTS idx_removals_msku_date  ON fba_removals (msku, request_date);

-- ── fc_transfers ──
CREATE INDEX IF NOT EXISTS idx_fct_msku            ON fc_transfers (msku);
CREATE INDEX IF NOT EXISTS idx_fct_fnsku           ON fc_transfers (fnsku);
CREATE INDEX IF NOT EXISTS idx_fct_date            ON fc_transfers (transfer_date);

-- ── fba_summary ──
CREATE INDEX IF NOT EXISTS idx_fbasumm_msku        ON fba_summary (msku);
CREATE INDEX IF NOT EXISTS idx_fbasumm_fnsku       ON fba_summary (fnsku);
CREATE INDEX IF NOT EXISTS idx_fbasumm_disp        ON fba_summary (disposition);

-- ── replacements ──
CREATE INDEX IF NOT EXISTS idx_repl_msku           ON replacements (msku);

-- ── gnr_report ──
CREATE INDEX IF NOT EXISTS idx_gnr_msku            ON gnr_report (msku);
CREATE INDEX IF NOT EXISTS idx_gnr_fnsku           ON gnr_report (fnsku);
CREATE INDEX IF NOT EXISTS idx_gnr_date            ON gnr_report (report_date);

-- ── settlement_report ──
CREATE INDEX IF NOT EXISTS idx_settle_settlement   ON settlement_report (settlement_id);
CREATE INDEX IF NOT EXISTS idx_settle_sku          ON settlement_report (sku);
CREATE INDEX IF NOT EXISTS idx_settle_posted       ON settlement_report (posted_date_time);

-- ── payment_repository ──
CREATE INDEX IF NOT EXISTS idx_pay_sku             ON payment_repository (sku);
CREATE INDEX IF NOT EXISTS idx_pay_order_id        ON payment_repository (order_id);
CREATE INDEX IF NOT EXISTS idx_pay_settlement      ON payment_repository (settlement_id);

-- ── case_tracker ──
CREATE INDEX IF NOT EXISTS idx_case_msku           ON case_tracker (msku);
CREATE INDEX IF NOT EXISTS idx_case_recon_type     ON case_tracker (recon_type);
CREATE INDEX IF NOT EXISTS idx_case_status         ON case_tracker (status);

SELECT 'InvenSync indexes applied!' AS result;
