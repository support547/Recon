-- Remove quotes from ALL tables ALL text columns

-- shipped_to_fba
UPDATE shipped_to_fba SET
  msku        = REPLACE(REPLACE(msku,'"',''),'''',''),
  title       = REPLACE(REPLACE(title,'"',''),'''',''),
  asin        = REPLACE(REPLACE(asin,'"',''),'''',''),
  fnsku       = REPLACE(REPLACE(fnsku,'"',''),'''',''),
  shipment_id = REPLACE(REPLACE(shipment_id,'"',''),'''','');

-- fba_receipts
UPDATE fba_receipts SET
  msku  = REPLACE(REPLACE(msku,'"',''),'''',''),
  title = REPLACE(REPLACE(title,'"',''),'''',''),
  asin  = REPLACE(REPLACE(asin,'"',''),'''',''),
  fnsku = REPLACE(REPLACE(fnsku,'"',''),'''',''),
  shipment_id = REPLACE(REPLACE(COALESCE(shipment_id,''),'"',''),'''','');

-- sales_data
UPDATE sales_data SET
  msku  = REPLACE(REPLACE(msku,'"',''),'''',''),
  fnsku = REPLACE(REPLACE(COALESCE(fnsku,''),'"',''),'''',''),
  asin  = REPLACE(REPLACE(COALESCE(asin,''),'"',''),'''','');

-- customer_returns
UPDATE customer_returns SET
  msku  = REPLACE(REPLACE(msku,'"',''),'''',''),
  asin  = REPLACE(REPLACE(COALESCE(asin,''),'"',''),'''',''),
  fnsku = REPLACE(REPLACE(COALESCE(fnsku,''),'"',''),'''',''),
  title = REPLACE(REPLACE(COALESCE(title,''),'"',''),'''',''),
  disposition = REPLACE(REPLACE(COALESCE(disposition,''),'"',''),'''',''),
  reason      = REPLACE(REPLACE(COALESCE(reason,''),'"',''),'''','');

-- reimbursements
UPDATE reimbursements SET
  msku  = REPLACE(REPLACE(msku,'"',''),'''',''),
  fnsku = REPLACE(REPLACE(COALESCE(fnsku,''),'"',''),'''',''),
  asin  = REPLACE(REPLACE(COALESCE(asin,''),'"',''),'''',''),
  title = REPLACE(REPLACE(COALESCE(title,''),'"',''),'''',''),
  reason= REPLACE(REPLACE(COALESCE(reason,''),'"',''),'''',''),
  reimbursement_id = REPLACE(REPLACE(COALESCE(reimbursement_id,''),'"',''),'''','');

-- fc_transfers
UPDATE fc_transfers SET
  msku  = REPLACE(REPLACE(msku,'"',''),'''',''),
  fnsku = REPLACE(REPLACE(COALESCE(fnsku,''),'"',''),'''',''),
  asin  = REPLACE(REPLACE(COALESCE(asin,''),'"',''),'''',''),
  title = REPLACE(REPLACE(COALESCE(title,''),'"',''),'''','');

-- fba_removals
UPDATE fba_removals SET
  msku  = REPLACE(REPLACE(msku,'"',''),'''',''),
  fnsku = REPLACE(REPLACE(COALESCE(fnsku,''),'"',''),'''',''),
  disposition  = REPLACE(REPLACE(COALESCE(disposition,''),'"',''),'''',''),
  order_status = REPLACE(REPLACE(COALESCE(order_status,''),'"',''),'''','');

-- fba_summary
UPDATE fba_summary SET
  msku  = REPLACE(REPLACE(msku,'"',''),'''',''),
  fnsku = REPLACE(REPLACE(COALESCE(fnsku,''),'"',''),'''',''),
  asin  = REPLACE(REPLACE(COALESCE(asin,''),'"',''),'''',''),
  title = REPLACE(REPLACE(COALESCE(title,''),'"',''),'''',''),
  disposition = REPLACE(REPLACE(COALESCE(disposition,''),'"',''),'''','');

-- shipment_receiving
UPDATE shipment_receiving SET
  shipment_id   = REPLACE(REPLACE(COALESCE(shipment_id,''),'"',''),'''',''),
  shipment_name = REPLACE(REPLACE(COALESCE(shipment_name,''),'"',''),'''',''),
  ship_to       = REPLACE(REPLACE(COALESCE(ship_to,''),'"',''),'''',''),
  status        = REPLACE(REPLACE(COALESCE(status,''),'"',''),'''','');

SELECT 'All quotes removed from all tables!' AS result;
