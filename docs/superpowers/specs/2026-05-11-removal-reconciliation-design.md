# Removal Reconciliation — Design

**Date:** 2026-05-11
**Status:** Approved sections 1-4. Implementation in progress.
**Scope:** Port v1 Removal Reconciliation (HTML/Express) into new-ERP (Next.js + Prisma).

---

## 1. Architecture

```
app/(dashboard)/removal-reconciliation/page.tsx       SSR loader
  ↓
actions/removal-reconciliation.ts                     server actions
  ↓
lib/removal-reconciliation/
  ├── matching.ts     buildShipmentMap, buildReceiptMap, buildCaseMap
  ├── formula.ts      computeRemovalRow
  ├── aggregate.ts    stats summary
  └── types.ts
  ↓
lib/prisma.ts
  ↓
schema.prisma  (already ready)
```

UI tree under `components/removal-reconciliation/`:
- `removal-reconciliation-client.tsx` — tabs container
- `orders-tab/` — filter-bar, kpi-cards, orders-table, cells
- `receipts-tab/` — receipts-table
- `modals/` — receive-modal, reimbursement-modal, post-action-modal
- `shared/` — condition-button-grid, status-badge, wrong-item-badge

## 2. Data model

**No schema changes.** Use existing models:

- `FbaRemoval` — uploaded orders
- `RemovalShipment` — shipment detail
- `RemovalReceipt` — manual receipts (full extended fields)
- `CaseTracker` — reconType=REMOVAL

**Recon formula per (orderId, fnsku):**

```
expected_shipped = quantity − cancelled_qty − disposed_qty
actual_shipped   = SUM(RemovalShipment.shippedQty)
received_qty     = SUM(RemovalReceipt.receivedQty)
sellable / unsellable / missing = sums
rr_reimb_qty     = SUM(RemovalReceipt.reimbQty)
ct_reimb_qty     = SUM(CaseTracker.unitsApproved WHERE reconType=REMOVAL)
reimb_qty        = rr_reimb_qty > 0 ? rr_reimb_qty : ct_reimb_qty
```

**Receipt status decision tree:**
1. reimb_qty > 0 → REIMBURSED
2. receipt_count=0 AND order_status=Completed AND actual_shipped>0 → AWAITING
3. receipt_count=0 → NOT_APPLICABLE
4. unsellable>0 AND sellable=0 → DAMAGED
5. received >= expected → COMPLETE (RECEIVED)
6. received > 0 → PARTIAL
7. missing > 0 → MISSING
8. else → AWAITING

**Match key:** `(orderId, fnsku)` trimmed both sides.

**Lock state:** receivedQty>0 OR reimb_qty>0 → row locked. Unlock action resets receipt to allow re-entry.

## 3. Server actions

```typescript
getRemovalReconData(filters): { rows, receiptRows, stats }
saveReceiveAction(input): MutationResult        // upsert receipt + optional case
saveReimbursement(input): MutationResult
savePostAction(receiptId, input): MutationResult
unlockRemovalRow(orderId, fnsku): MutationResult
unlockReceiptRow(receiptId): MutationResult
deleteReceipt(id): MutationResult                // soft delete
listRemovalReceipts(filters): RemovalReceiptRow[]
```

All mutations call `revalidatePath('/removal-reconciliation')`.

Case auto-creation: when `raiseCase=true` in `saveReceiveAction`, insert CaseTracker (reconType=REMOVAL, orderId, fnsku, caseReason, unitsClaimed, amountClaimed, status='raised'), link via `RemovalReceipt.caseTrackerId`.

Case reimb sync: when CaseTracker.unitsApproved>0 + recon=REMOVAL, also update matching RemovalReceipt (post-MVP — initial release uses fallback chain in formula instead, no triggers).

## 4. UI

**Tabs:** Removal Orders | Receipts Log

**Orders tab:**
- 6 KPI cards (clickable filters): Total / Received / Awaiting / Partial+Missing / Reimbursed / Has Case
- Filter bar: orderStatus, disposition, type, dateRange, search, Clear, Total-Fee badge
- Orders table: 19 cols, sticky header, totals inline in header, action buttons (Receive/Case/Reimb), Lock + Unlock states

**Receipts tab:**
- Receipts table: 23 cols, action buttons (Post-Action/Reimb/Delete/Unlock)

**Modals:**
- ReceiveModal — 2-step, 8-button condition grid, optional case section, wrong-item toggle
- ReimbModal — qty/amount/notes
- PostActionModal — 8 action buttons, transfer-to, seller status, warehouse billing

URL state: `?tab=orders&status=Completed&recstatus=Awaiting&q=...`

## 5. Validation (zod)

- `receiveSchema` — tracking, carrier, qtys, condition, raiseCase + case fields
- `reimbSchema` — orderId, fnsku, qty, amount, notes
- `postActionSchema` — action, transferTo, sellerStatus, billing, optional reimb
- Cross-field: sellable+unsellable ≤ received

## 6. Edge cases

| Case | Handling |
|---|---|
| No receipts yet, order Completed | status=AWAITING |
| No receipts, order Cancelled | status=NOT_APPLICABLE |
| Multiple receipts for same (orderId,fnsku) | summed |
| Orphan shipment (shipment but no order) | excluded from main view |
| Case approved but no receipt entered | reimb falls back to ct_reimb |
| received > expected (overage) | status=COMPLETE, no error |
| Wrong item flagged | badge shown, doesn't change status |
| Soft-deleted records | excluded |

## 7. Effort

~3-4 days single dev. Files:
- 1 page, 1 layout-level wiring (sidebar already linked)
- 4 lib files, 1 actions file, 1 validations file
- ~14 UI components
- 0 schema migrations
