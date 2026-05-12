# Returns Reconciliation — Design

**Date:** 2026-05-11
**Status:** Approved scope. Building.

## Scope

Port v2 returns-recon.html into new ERP. Two tabs: Returns Analysis (rolled-up by order+FNSKU) + Returns Log (raw events). 6 KPI cards (consolidated from v2's 8). Case + Adjustment overlays. FNSKU verification.

## Architecture

```
app/(dashboard)/returns-reconciliation/page.tsx       SSR loader
  ↓
actions/returns-reconciliation.ts                      server actions
  ↓
lib/returns-reconciliation/
  ├── matching.ts     buildSalesFnskuMap, buildCaseMap, buildAdjMap, buildReimbMap
  ├── formula.ts      computeReturnRow
  ├── aggregate.ts    summaryStats
  └── types.ts
```

UI under `components/returns-reconciliation/`: client w/ tabs, analysis-tab, log-tab, modals (raise-case, adjust), shared (badges).

## Data model

No schema changes. Reads:
- `CustomerReturn` (returns)
- `SalesData` (FNSKU verification per orderId)
- `Reimbursement` (reason ILIKE '%return%')
- `CaseTracker` (reconType=RETURN)
- `ManualAdjustment` (reconType=RETURN)

## Formula

**Match key (Analysis):** `(orderId, fnsku)` from CustomerReturn.

**FNSKU verify:**
```
salesOrderExists = exists SalesData row with same orderId
salesOrderFnskuMatch = exists SalesData row with same (orderId, fnsku)

status =
  !salesOrderExists      → ORDER_NOT_FOUND
  salesOrderFnskuMatch   → MATCHED_FNSKU
  else                   → FNSKU_MISMATCH
```

**Effective reimbursement:**
```
db_reimb_qty   = SUM(Reimbursement.quantity WHERE msku=? AND reason ILIKE '%return%')
db_reimb_amt   = SUM(Reimbursement.amount  WHERE same)
case_reimb_qty = SUM(CaseTracker.unitsApproved WHERE reconType=RETURN AND msku=?)
case_reimb_amt = SUM(CaseTracker.amountApproved WHERE same)
adj_qty        = SUM(ManualAdjustment.qtyAdjusted WHERE reconType=RETURN AND orderId=? AND fnsku=?)

eff_reimb_qty = max(db_reimb_qty, case_reimb_qty) + adj_qty
eff_reimb_amt = max(db_reimb_amt, case_reimb_amt)
```

## Server actions

```typescript
getReturnsReconData(filters): { rows: ReturnRow[], logRows: ReturnLogRow[], stats }
saveReturnCaseAction(input): MutationResult<{id:string}>   // creates CaseTracker w/ reconType=RETURN
saveReturnAdjustmentAction(input): MutationResult<{id:string}> // creates ManualAdjustment w/ reconType=RETURN
```

All mutations call `revalidatePath('/returns-reconciliation') + '/cases-adjustments'`.

## UI

**Analysis tab:**
- 6 KPI cards (clickable filter): Total Returns / Matched / Mismatch / Not Found / Reimbursed / Has Case
- Filter bar: from / to / disposition / fnsku status / search
- Table: 16 cols (Order ID, Return FNSKU, MSKU, ASIN, Title, Returned Qty, Events, Dispositions, Reasons, Reimb Qty, Reimb $, Sales FNSKU, FNSKU Status, Case Status, Date Range, Actions)
- Row highlight: mismatch=red bg, not_found=amber bg
- Action buttons per row: ⚖️ Raise Case (if mismatch/not_found, hide if case exists), 🔧 Adjust
- Sticky header, totals row, column-totals click-to-filter

**Log tab:**
- 13 cols (raw return events): Return Date, MSKU, FNSKU, Order ID, Title, Qty, Disposition, Detailed Disp, Reason, Status, FC, LPN, Case ID
- Filter bar: from / to / disposition / search

## Validation (zod)

`raiseCaseSchema` — orderId, msku, fnsku, caseReason, unitsClaimed, amountClaimed, status, caseId?, notes?
`adjustmentSchema` — orderId, msku, fnsku, adjType, qtyAdjusted, reason, adjDate?, notes?

## Edge cases

| Case | Handling |
|---|---|
| Same MSKU returned in multiple orders | Each (orderId, fnsku) row separate |
| Customer returns wrong item | FNSKU_MISMATCH status; salesFnsku shown red |
| Order missing from sales_data | ORDER_NOT_FOUND status |
| Multiple return events same (orderId, fnsku) | Aggregated qty sum + event count |
| No reimb rows yet | reimbQty=0, eff via overlay |
| Case approval reflects in analysis | Live via fallback chain |
| Soft-deleted records | Excluded |

## Out of scope

- Tooltips for case/adj breakdown (v2 has rich hover; new ERP gets simple display + tooltip later)
- LPN drill-down
- Direct download attachments
