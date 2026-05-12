# Shipment Reconciliation Rebuild — Design

**Date:** 2026-05-11
**Status:** Design approved by user. Ready for implementation planning.
**Scope:** Rewrite shipment reconciliation logic + UI in `fba-newreconciliation` (Next.js + Prisma ERP). Keep schema with minor edits.

---

## 1. Background

Three codebases studied:

- **v1 (`FBA Inventory/`)** — Node/Express + raw HTML/JS. Recon UI built, case/adjustment endpoints never implemented (404 on action buttons).
- **v2 (`FBA Inventory_1/`)** — Same stack, fully working. Reference for behavior. Adds `shipment_status` table, unified `case_tracker`, `manual_adjustments`. Users familiar with this UI.
- **v3 (`fba-newreconciliation/`)** — Next.js 15 + Prisma + Server Actions. Current target. Schema mostly in place. Logic + UI broken: dual "pending" formulas (drawer ≠ table), FNSKU-only matching (cross-shipment contamination), unused `ReconciliationSummary` model, `Adjustment.@@unique([msku])` blocks multiple adjustments per SKU.

User reported "not working properly". Investigation confirmed three root causes:
1. **Wrong match key** — receipts grouped by FNSKU only, attributed to first shipment.
2. **Two different pending formulas** — table cell uses `pending − totalActioned`, drawer uses `pending − case_raised − adj_qty`.
3. **Schema/code drift** — soft-delete fields exist but only hard-delete is used; orphan data rows survive `uploaded_files` deletion (separately fixed during this session — see "Pre-design bug fix" below).

---

## 2. Goals

1. Single canonical formula for shortage/pending. Table + drawer + KPIs same numbers.
2. Match key = `(fnsku, shipmentId)`. No cross-shipment contamination.
3. Two-tab UI: Recon (SKU + Shipment views, drawer) | Cases & Adjustments (CRUD).
4. URL-shareable filters.
5. All mutations revalidate affected pages.
6. 100% test coverage on pure recon logic.

## 3. Non-goals

- Audit log table for mutations.
- Bulk case creation, auto-suggest, FBA Summary integration in formula.
- Multi-tenant store isolation.
- E2E Playwright suite (post-MVP).

---

## 4. Architecture

```
app/(dashboard)/shipment-reconciliation/page.tsx       (SSR loader)
  ↓
actions/shipment-reconciliation.ts                     (server actions)
  ↓
lib/shipment-reconciliation/                           (pure logic)
  ├── matching.ts      buildReceiptMap, buildReimbMap, buildCaseMap, buildAdjMap
  ├── formula.ts       computeReconRow (canonical formula)
  ├── overlay.ts       buildActionOverlay
  ├── aggregate.ts     aggregateByShipment
  └── types.ts
  ↓
lib/prisma.ts
  ↓
prisma/schema.prisma                                   (minor edits — see §5)
```

UI tree under `components/shipment-reconciliation/`:

```
shipment-reconciliation-client.tsx       (tabs container)
├── recon-tab/
│   ├── filter-bar.tsx
│   ├── kpi-cards.tsx
│   ├── view-toggle.tsx
│   ├── sku-table.tsx
│   ├── shipment-table.tsx
│   ├── detail-drawer.tsx
│   └── recon-action-dialog.tsx
├── cases-adjustments-tab/
│   ├── cases-table.tsx
│   ├── adjustments-table.tsx
│   ├── case-dialog.tsx
│   └── adjustment-dialog.tsx
└── shared/
    ├── status-badge.tsx
    ├── receive-progress-bar.tsx
    └── cells.tsx
```

---

## 5. Data model (Prisma schema changes)

No new tables. Edits to existing models:

1. **`Adjustment`** — drop `@@unique([msku])`. Add `@@index([msku])`. (Current constraint blocks multiple adjustments per MSKU — bug.)
2. **`ReconciliationSummary`** — **delete model entirely.** Unused. Formula is compute-on-demand.
3. **`ShipmentStatus.status`** — add Prisma enum `ShipmentStatusValue { CLOSED, RECEIVING, WORKING, SHIPPED, UNKNOWN }`. Normalize on upload (uppercase trim).
4. **`CaseTracker.status`** — add Prisma enum `CaseStatus { pending, raised, approved, partial, rejected, closed }`.
5. **`CaseTracker`** — add `@@index([reconType, fnsku, shipmentId])`.
6. **`ManualAdjustment`** — add `@@index([reconType, fnsku, shipmentId])`.

All migrations reversible.

### Models used by recon (read-only):

| Model | Filter |
|---|---|
| `ShippedToFba` | `deletedAt IS NULL`, optional shipmentId filter |
| `FbaReceipt` | none — sum all |
| `Reimbursement` | `reason = 'Lost_Inbound'` |
| `ShipmentStatus` | join on `shipmentId` |
| `CaseTracker` | `reconType = 'shipment'`, `deletedAt IS NULL` |
| `ManualAdjustment` | `reconType = 'shipment'`, `deletedAt IS NULL` |

---

## 6. Canonical formula

**Match key:** `(fnsku, shipmentId)` — both trimmed, normalized to uppercase on insert and on match. Empty/null shipmentId rows excluded from receiptMap (logged + counted).

**Inputs per row (one shipped SKU = one row):**

```
shipped_qty    = ShippedToFba.quantity
received_qty   = SUM(FbaReceipt.quantity WHERE fnsku=? AND shipmentId=?)
reimb_qty      = SUM(Reimbursement.quantity WHERE fnsku=? AND reason='Lost_Inbound')
                 (FNSKU-only — Amazon reimb not always tagged with shipment_id)
case_claimed   = SUM(CaseTracker.unitsClaimed WHERE same key + reconType='shipment')
case_approved  = SUM(CaseTracker.unitsApproved WHERE same)
case_amount    = SUM(CaseTracker.amountApproved WHERE same)
adj_qty        = SUM(ManualAdjustment.qtyAdjusted WHERE same)  ← signed
shipment_state = ShipmentStatus.status (CLOSED/RECEIVING/WORKING/SHIPPED/UNKNOWN)
```

**Derived:**

```
shortage         = MAX(0, shipped_qty - received_qty)
excess           = MAX(0, received_qty - shipped_qty)
recovered_raw    = case_approved + MAX(0, adj_qty)
recovered        = MIN(shortage, recovered_raw)            ← cap at shortage
pending          = MAX(0, shortage - recovered)            ← CANONICAL
reimb_remaining  = MAX(0, reimb_qty - case_approved)
receive_pct      = MIN(999, received_qty / shipped_qty × 100)
```

**Reimbursements shown separately, NOT subtracted from pending** — avoids double-counting with cases.

**Status enum (single canonical, evaluated in this priority order — first match wins):**

```
1. matched            shortage=0 AND received>=shipped AND excess=0
2. excess             excess>0
3. awaiting_receive   shortage>0 AND shipment_state IN (RECEIVING, WORKING, UNKNOWN)
4. fully_recovered    shortage>0 AND pending=0
5. partial_recovered  shortage>0 AND pending>0 AND recovered>0
6. in_progress        shortage>0 AND pending>0 AND case_claimed>0 AND recovered=0
7. case_needed        shortage>0 AND pending>0 AND case_claimed=0
                      (default for CLOSED/SHIPPED shipments with no action taken)
```

Drawer + table + KPIs all consume same row object. No separate math.

---

## 7. Server actions (`actions/shipment-reconciliation.ts`)

All return `MutationResult<T> = { ok:true, data:T } | { ok:false, error:string }`.

```typescript
getShipmentReconciliationData(input: {
  shipmentStatus?: ShipmentStatusValue | 'all'
  shipmentId?: string | 'all'
  reconStatus?: ReconStatus | 'all'
  search?: string   // msku/asin/fnsku
}): Promise<{
  rows: ReconRow[]
  shipmentRows: ShipmentAggRow[]
  kpis: { totalSku, totalUnits, matchedSku, matchedUnits, shortageSku, shortageUnits, caseNeededSku, pendingUnits, reimbUnits }
  shipmentOptions: { id, status, label }[]
}>

saveShipmentCaseAction(input)
saveShipmentAdjustmentAction(input)
updateShipmentCase(id, input)
updateShipmentAdjustment(id, input)
deleteShipmentCase(id)             // soft delete
deleteShipmentAdjustment(id)       // soft delete
listShipmentCases({ status, search })
listShipmentAdjustments({ adjType, search })
```

**Flow inside `getShipmentReconciliationData`:**

1. `Promise.all` 6 Prisma queries (shipped, receipts, reimb, shipment_status, cases, adjustments).
2. Build 5 maps in single pass each: receiptMap, reimbMap, shipStatusMap, caseMap, adjMap. Key is `${fnsku}|${shipmentId}` except reimbMap (FNSKU-only).
3. Iterate `ShippedToFba` → `computeReconRow()` per shipped record.
4. Apply post-filter (reconStatus, search).
5. Aggregate to shipmentRows. Compute KPIs.
6. Return.

All mutations call `revalidatePath('/shipment-reconciliation')` + `revalidatePath('/cases-adjustments')`.

---

## 8. Validation (`lib/validations/shipment-reconciliation.ts`)

Zod schemas with `.refine()` for cross-field invariants:

- `qty_after = qty_before + qty_adjusted`
- `units_approved ≤ units_claimed`
- `amount_approved ≤ amount_claimed` when claimed not null
- `resolvedDate ≥ raisedDate` if both set

Pre-processors: empty string → null, decimal coercion.

Error mapping in actions:
- Prisma `P2002` → "Duplicate case for this shipment+SKU."
- Prisma `P2003` → "Linked case not found."
- Zod failure → first issue message.
- Generic → console.error + "Could not save. Try again."

---

## 9. UI components

| Component | Purpose |
|---|---|
| `<FilterBar>` | shipment status, shipment ID, recon status, search, clear. URL-synced via `useSearchParams`. |
| `<KpiCards>` | 4 cards (Total, Matched, Shortage, Cases Needed). Click toggles filter. |
| `<ViewToggle>` | SKU view ↔ Shipment view. |
| `<SkuReconTable>` | Tanstack table, 14 cols. Row click → drawer. |
| `<ShipmentAggTable>` | Aggregated rollup. Row click → drill into SKU view. |
| `<ReconDetailDrawer>` | Right slide-over. 5-tile flow, case/adj history, action buttons. |
| `<ReconActionDialog>` | 2-step: choose Case OR Adjustment, then form. |
| `<CasesTable>` / `<AdjustmentsTable>` | CRUD for case_tracker + manual_adjustments. |
| `<CaseDialog>` / `<AdjustmentDialog>` | Create/edit forms. |
| `<ReconStatusBadge>` | Single status→label+color map. |
| `<ReceiveProgressBar>` | %-of-shipped color-coded bar (green ≥95, amber 70-94, red <70). |

URL contract:
```
/shipment-reconciliation?tab=recon&view=sku&status=case_needed&shipment=FBA199PSVLR0&q=greek
```

Client-side filtering (data <10k rows typical). Heavy filtering → debounced server action.

---

## 10. Edge cases

| Case | Handling |
|---|---|
| `shipmentId IS NULL` in shipped | Excluded from recon. Surface in Data Explorer separately. |
| `fnsku IS NULL` in shipped | Skip. Surface count in KPI footer. |
| Same FNSKU, two shipments | Key `(fnsku, shipmentId)` isolates. |
| Receipt with null shipmentId | First pass: log + ignore. Future: FNSKU-only fallback bucket. |
| `shipped_qty = 0` | Skip row. |
| Received > shipped | status=excess, pending=0. |
| Received=0, status=RECEIVING/WORKING | status=awaiting_receive (don't flag case_needed). |
| Negative adj | Treated as 0 in `recovered`; tracked but doesn't reduce shortage. |
| Case approved > shortage | `recovered = min(shortage, ...)` — caps at shortage. |
| Concurrent edits | Last write wins. Toast warns if `updatedAt` mismatch. |

---

## 11. Testing

**Unit (Vitest):**
- `formula.test.ts` — 8+ cases covering all status branches, edge cases (negative adj, over-approval, etc.).
- `matching.test.ts` — map building, null exclusion.
- `overlay.test.ts` — multi-case aggregation, status priority, soft-delete exclusion.
- `aggregate.test.ts` — shipment rollup sum invariants.
- **Target: 100% coverage on `lib/shipment-reconciliation/*`.**

**Integration (Vitest + Prisma test DB):**
- `actions/shipment-reconciliation.test.ts` — full pipeline, filter combos, case+overlay roundtrip.
- `actions/uploads.test.ts` regression — re-upload semantics, delete cascades both fact + history rows, locked batches.

**Manual QA (first deploy):**
10-item checklist covering upload → recon → case → approve → status flip → delete batch → revalidate.

---

## 12. Migration + rollout

**Phase 0 — Schema migrations** (off-hours):
1. Drop `Adjustment.@@unique([msku])` + add `@@index([msku])`.
2. Drop `ReconciliationSummary` model + table.
3. Add `CaseTracker @@index([reconType, fnsku, shipmentId])`.
4. Add `ManualAdjustment @@index([reconType, fnsku, shipmentId])`.
5. Optional: Add Prisma enums + backfill.

**Phase 1 — Logic rewrite** (no UI change):
1. Create `lib/shipment-reconciliation/` (5 files).
2. Unit tests (gate).
3. Rewrite `actions/shipment-reconciliation.ts` against new lib. Stable signatures.
4. Integration tests.
5. Deploy. Smoke-test on real data.

**Phase 2 — UI rebuild** (component-by-component):
1. `<ReconStatusBadge>` swap-in.
2. `<SkuReconTable>` cells.
3. `<ReconDetailDrawer>`.
4. `<FilterBar>` with URL state.
5. `<KpiCards>` click-to-filter.
6. `<ShipmentAggTable>` + view toggle.
7. `<ReconActionDialog>` 2-step.
8. Cases/Adjustments tab CRUD verify.
9. Manual QA checklist.

**Phase 3 — Cleanup**:
1. Run remaining `_cleanup_orphans.sql` (100 shipment_status orphans + any others).
2. Decide on `deletedAt` columns: remove (recommended) or switch to soft-delete pattern.
3. Add `/admin/cleanup` route for orphan finder + cleanup (gated).

**Effort estimate:** Phase 0+1 = 2-3 days. Phase 2 = 4-5 days. Phase 3 = 1 day. **~1.5 weeks single dev.**

---

## 13. Pre-design bug fix (already applied during this session)

User reported deleted shipment IDs (FBA192S6646F, FBA194J43M4P, FBA19508M0T4) still visible in Data Explorer after deleting from Upload History.

**Root cause:** Mixed. (1) Current code logic actually works — verified by transaction simulation. (2) These specific shipments were uploaded BEFORE the data-delete switch case was wired up; their `uploaded_files` rows were deleted earlier but fact rows were orphaned. (3) `deleteUploadBatch` did not call `revalidatePath`, so `/data-explorer` showed stale cached SSR results even when delete worked.

**Fixes applied to [actions/uploads.ts](../../../actions/uploads.ts):**
- Added `revalidatePath` import + `revalidateAll()` helper called from `deleteUploadBatch`, `setUploadLocked`, and successful `uploadFile`.
- `processShipped` now deletes stale `uploaded_files` rows for the re-uploaded shipmentId, preventing orphan history rows from future re-uploads.

**One-time DB cleanup:** Deleted the 172 orphan `shipped_to_fba` rows for the 3 named shipments. `_cleanup_orphans.sql` script saved at repo root for broader future cleanup (still has 100 `shipment_status` orphans pending user authorization).

---

## 14. Open questions

None at design close. Implementation plan pending.

## 15. Approvals

User confirmed sections 1–8 during brainstorming dialog (2026-05-11).
