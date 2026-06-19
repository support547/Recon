# FBA Reconciliation ERP

Next.js 16 + TypeScript + Prisma + PostgreSQL app for reconciling Amazon FBA inventory across shipments, sales, returns, removals, FC transfers, replacements, GNR, adjustments, and settlements.

## Stack

- Next.js 16.2.6, React 19.2.4, TypeScript 5
- Prisma 7.8.0 (`@prisma/adapter-pg`) + PostgreSQL
- next-auth v5 beta, Tailwind v4, shadcn/ui, Radix
- `@tanstack/react-table`, react-hook-form, Zod
- csv-parse, xlsx, busboy (uploads), file-saver, sonner (toasts)

## Environment Variables

Required in `.env`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_ENABLED` | optional | `"true"` to enable auth. Defaults to dev stub user. |
| `NEXTAUTH_SECRET` | if `AUTH_ENABLED=true` | session encryption secret |
| `AUTH_SECRET` | alternative to `NEXTAUTH_SECRET` | |

Validation runs at startup via `lib/env.ts`.

## Setup

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Scripts: `dev`, `build`, `start`, `lint`.

## Routes

App router groups everything under `app/(dashboard)/`:

- `/upload` — bulk report ingest
- `/full-reconciliation` — per-FNSKU master reconciliation
- `/shipment-reconciliation` — inbound shipments vs receipts
- `/returns-reconciliation` — customer returns lifecycle
- `/removal-reconciliation` — removal orders → shipments → receipts
- `/replacement-reconciliation` — replacement orders vs returns/reimbs
- `/fc-transfer-reconciliation` — FC-to-FC transfer balancing
- `/adjustment-reconciliation` — inventory adjustment ledger
- `/gnr-reconciliation` — Grade & Resell tracking (v2)
- `/grade-resell` — GNR receiving workspace
- `/settlement-report` — Amazon statements
- `/sales-orders`, `/sales-reconciliation`, `/data-explorer`, `/cases-adjustments`

Middleware lives in `proxy.ts` (Next.js 16 convention — replaces `middleware.ts`).

## Report Types

16 Amazon reports are uploaded via `/upload`. Parsers live in `actions/uploads.ts`; the canonical list is in `lib/upload-report-types.ts`.

| Report | Target table | Source |
|---|---|---|
| `shipped_to_fba` | `shipped_to_fba` | InvenSync export |
| `sales_data` | `sales_data` | Amazon Sales (Flat File) |
| `fba_receipts` | `fba_receipts` | Inventory Event Detail |
| `customer_returns` | `customer_returns` | FBA Customer Returns |
| `reimbursements` | `reimbursements` | Reimbursements report |
| `fba_removals` | `fba_removals` | Removal Order Detail |
| `fc_transfers` | `fc_transfers` | Inventory Event Detail (transfers) |
| `shipment_status` | `shipment_status` | Inbound Shipments |
| `fba_summary` | `fba_summary` | Inventory Ledger - Summary |
| `replacements` | `replacements` | Replacements report |
| `adjustments` | `adjustments` | Manual case-tracker adjustments |
| `inventory_adjustments` | `inventory_adjustments` | Inventory Adjustments report |
| `gnr_report` | `gnr_report` | Grade & Resell unit status |
| `payment_repository` | `payment_repository` | Date Range Transaction |
| `removal_shipments` | `removal_shipments` | Removal Shipment Detail |
| `settlement_report` | `settlement_report` | Statements / settlements |

## Full Reconciliation (per FNSKU)

Single source of truth: `lib/full-reconciliation/formula.ts`. Composed in `actions/full-reconciliation.ts`. Display in `components/full-reconciliation/`.

Per **FNSKU** (not MSKU). MSKU/title/ASIN are carried from the shipped-to-FBA row.

```
endingBalance = receiptQty
              − soldQty
              + returnQty
              − reimbQty
              − removalRcptQty
              − replQty
              − gnrQty
              + fcNet

variance      = fbaEndingBalance − endingBalance
```

`fbaEndingBalance` is the latest SELLABLE row in `fba_summary` for that FNSKU.

Reimbursement filter (`REIMB_REASON_FILTER` in `formula.ts`): only these reasons count toward `reimbQty`:

- `damaged_warehouse`
- `lost_warehouse`
- `customerserviceissue`
- `returnadjustment`
- `generaladjustment`

`Reimbursement_Reversal` rows are netted back (negated qty/amount) when the original reimbursement's reason is in the filter — resolved via `originalReimbType`, else `originalReimbId` lookup.

Status (`FullReconStatus`):

| Status | Meaning |
|---|---|
| `Matched` | `fbaEnding === endingBalance` |
| `Over` | `fbaEnding > endingBalance` |
| `Reimbursed` | `fbaEnding < endingBalance` and `reimbQty ≥ |variance|` |
| `Take Action` | `fbaEnding < endingBalance` and reimbursement does not cover the gap |
| `No Snapshot` | no `fba_summary` row for the FNSKU |

Each row also carries a **Shipment-Recon view** (`shipmentReimbQty`, `shipmentCaseCount`, `shipmentAdjQty`, …) so the Shortage hover mirrors Shipment Recon — Lost_Inbound reimbursements + SHIPMENT-typed cases/adjustments only.

## Shipment Reconciliation

Inbound shipments vs what FBA received. Per **FNSKU**, scoped by shipment (`"<shipmentId>|<fnsku>"`, FNSKU-only fallback).

Logic: `lib/shipment-reconciliation-logic.ts`. Display: `lib/shipment-reconciliation-display.ts`.

```
shortage         = max(0, shippedQty − receivedQty)
pending          = max(0, shortage − reimbQty)     // reimbQty = Lost_Inbound only
effectivePending = max(0, pending − caseContribution − adjMagnitude)
```

Inputs: `shipped_to_fba`, `fba_receipts`, `reimbursements` (filtered to `reason = "Lost_Inbound"`), `shipment_status` (status + lastUpdated → days-open), plus case/adjustment overlay (FNSKU-keyed).

Base status (`ReconStatus`):

| Status | Meaning |
|---|---|
| `matched` | shortage = 0 and received ≤ shipped |
| `excess` | received > shipped |
| `partial` | shortage > 0 but fully covered by Lost_Inbound reimbursement |
| `case_needed` | shortage > 0 and pending > 0 |
| `shortage` | residual shortage (pre-overlay) |

Display badges layer on cases/adjustments: `reimbursed`, `action_taken`, `case_raised`, `in_progress`, `partial_reimb`, `waiting_closed`, `take_action`.

> Known gap: Lost_Inbound reimbursements key on FNSKU only — multi-shipment FNSKUs share one reimbursement pool (`shipment_status` schema lacks shipmentId on reimb rows).

## Returns Reconciliation

Verifies customer returns landed back in inventory or were reimbursed. Aggregates per **orderId + MSKU**; other entities match on FNSKU / ASIN / LPN / orderId as noted.

Logic: `lib/returns-reconciliation/{formula,asin-formula,matching,types,final-status,return-action-status,disposition-labels}.ts`.

Routing paths:

- **GNR MSKU** (prefix `amzn.gr.`) → `GNR_TRACKING` (bridge found) or `UNKNOWN_GNR_CASE`.
- **Amazon "Reimbursed"** → verify by orderId + MSKU → `RESOLVED` or `INVESTIGATE`.
- **"Unit returned to inventory"** (default) → ownership check (orderId + MSKU in sales data), then:
  - *Sellable* → `fba_summary` daily match (MSKU + disposition + returnDate ±1d) → inventory status; GNR-bridge fallback on gap.
  - *Damaged/defective* → reimbursement check; if none, LPN match in GNR → `TRANSFERRED_TO_GNR`.

Windows: `PROCESSING_WINDOW_DAYS = 60`, `SUMMARY_TOLERANCE_DAYS = 3`.

Inputs: `customer_returns` (primary), `reimbursements` (reason-filtered, reversals netted via `originalReimbId`), `gnr_report` (bridge + LPN qty), `fba_summary` (inventory confirm — daily MSKU+disposition+date), `sales_data` (ownership), `cases`, `adjustments`.

Status enums (`lib/returns-reconciliation/types.ts`):

- `OwnershipStatus`: `CONFIRMED`, `GNR_TRACKING`, `UNKNOWN_GNR`, `ORDER_NOT_FOUND`
- `InventoryStatus`: `IN_INVENTORY`, `NOT_IN_INVENTORY`, `PENDING_SUMMARY`, `NOT_APPLICABLE`
- `ReimbStatus`: `REIMBURSED_CASH`, `REIMBURSED_INVENTORY`, `REIMBURSED_UNVERIFIED`, `NOT_REIMBURSED`, `NOT_APPLICABLE`

`FinalStatus`:

| Status | Meaning |
|---|---|
| `RESOLVED` | inventory confirmed, reimbursement confirmed, or GNR tracked |
| `PENDING` | awaiting FbaSummary, case pending, or within 60-day window |
| `CASE_NEEDED` | gap after 60 days, no case yet |
| `GNR_TRACKING` | GNR MSKU with confirmed bridge |
| `UNKNOWN_GNR_CASE` | GNR MSKU, no bridge — needs case |
| `TRANSFERRED_TO_GNR` | damaged return moved to GNR via LPN match |
| `INVESTIGATE` | "Reimbursed" but unverified, or order not found |

ASIN verification (`asin-formula.ts`) cross-checks ASIN + MSKU vs sales orders and catalog (by FNSKU): `FULLY_VERIFIED`, `ASIN_MISMATCH`, `MSKU_MISMATCH`, `MULTI_MISMATCH`, `NOT_IN_CATALOG`, `ORDER_NOT_FOUND`.

## Removal Reconciliation

Tracks removal orders → shipments → receipts. Per **orderId + FNSKU** (key `"<orderId>|<fnsku>"`). Per-tracking breakdown kept in `TrackingDetail[]`.

Logic: `lib/removal-reconciliation/{formula,matching,aggregate,types}.ts`.

```
expectedShipped = max(0, requestedQty − cancelledQty − disposedQty)
```

No single variance metric — receipt status is derived from reimbQty, receipt counts, order status, actualShipped, and sellable/unsellable/missing splits.

Inputs: `fba_removals`, `removal_shipments`, `removal_receipts`, reimbursements (`rrReimb*` from receipts, `ctReimb*` case-tracker fallback), cases.

Status (`RemovalReceiptStatusKey`):

| Status | Meaning |
|---|---|
| `REIMBURSED` | reimbQty > 0 |
| `COMPLETE` | received ≥ expectedShipped |
| `PARTIAL` | received > 0 but < expectedShipped |
| `MISSING` | missingQty > 0 |
| `DAMAGED` | unsellable > 0 and sellable = 0 |
| `AWAITING` | order completed + shipped, no receipt yet |
| `NOT_APPLICABLE` | no receipts and order not completed |

## Replacement Reconciliation

Matches replacement orders to returns + reimbursements on both the replacement orderId AND the original orderId.

Logic: `lib/replacement-reconciliation/{formula,matching,aggregate,types}.ts`.

`coveredQty = min(quantity, returnQty + effectiveReimbQty)` — clamped because a replacement can match returns on BOTH orders and could otherwise sum past units shipped. KPI math uses the clamp; raw `returnQty` / `effectiveReimbQty` stay un-clamped for drill-down.

Status (`ReplacementStatusKey`): `TAKE_ACTION`, `WAITING_RETURN`, `PARTIAL`, `RETURNED`, `REIMBURSED`, `ADJUSTED`, `RESOLVED`.

## FC Transfer Reconciliation

FC-to-FC transfer balancing per FNSKU. `lib/fc-transfer-reconciliation/{by-fc,full-recon,matching,types}.ts` + co-located `*.test.ts`.

`fcNet = in − out`. Status: `Balanced` (net = 0) / `Excess` (net > 0) / `Take Action` (net < 0 and earliest event > 60 days) / `Waiting`.

## Adjustment Reconciliation

Inventory adjustment ledger overlay. `lib/adjustment-reconciliation/{formula,matching,aggregate,types}.ts`.

## GNR Reconciliation

Grade & Resell tracking. v2 logic in `lib/gnr-reconciliation/v2/{formula,types}.ts` (with `formula.test.ts`). Receiving workspace at `/grade-resell`.

## Conventions

- **Soft delete** on every business model — `deletedAt: Date | null`. ALWAYS query with `where: { deletedAt: null }`.
- **Server actions** return `MutationResult = { ok: true } | { ok: false, error: string }`.
- Keep formula logic in `lib/<module>/formula.ts`. Actions in `actions/` orchestrate I/O and call formula functions.
- Zod schemas in `lib/validations/<module>.ts`.
- Decimal fields use `new Prisma.Decimal(value)`.
- Middleware = `proxy.ts` (Next.js 16); the exported function must be named `proxy`.
- Next.js 16 has breaking changes vs older docs — read `node_modules/next/dist/docs/` before writing route handlers, fetch caching, or layout code.

## Auth

`AUTH_ENABLED=false` (default in dev): `requireAuth()` in `actions/auth.ts` returns a stub system user — all mutations work without login. Set `AUTH_ENABLED=true` plus `NEXTAUTH_SECRET` (or `AUTH_SECRET`) to enable next-auth v5.

## Migrations

```bash
npx prisma migrate dev --name <change>
npx prisma migrate deploy
```

Data model: `prisma/schema.prisma`.
