# FBA Reconciliation ERP

Next.js 16 + TypeScript + Prisma + PostgreSQL app for reconciling Amazon FBA inventory, returns, removals, FC transfers, GNR, replacements, and settlement reports.

## Stack

- Next.js 16.2.6, React 19.2.4, TypeScript 5
- Prisma 7.8.0 + PostgreSQL
- next-auth v5 beta, Tailwind v4, shadcn/ui
- Zod, csv-parse, xlsx

## Environment Variables

Required in `.env`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_ENABLED` | optional | `true` to enable auth. Defaults to dev stub user. |
| `NEXTAUTH_SECRET` | if `AUTH_ENABLED=true` | session encryption secret |
| `AUTH_SECRET` | alternative to `NEXTAUTH_SECRET` | |

Validation runs at startup via `lib/env.ts` (imported from `next.config.ts`).

## Setup

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

## Report Types

15 Amazon reports are uploaded via `/upload`. Parsers live in `actions/uploads.ts`:

| Report | Target table | Source |
|---|---|---|
| Shipped to FBA | `shipped_to_fba` | InvenSync export |
| Sales Data | `sales_data` | Amazon Sales (Flat File) |
| FBA Receipts | `fba_receipts` | Inventory Event Detail |
| Customer Returns | `customer_returns` | FBA Customer Returns |
| Reimbursements | `reimbursements` | Reimbursements report |
| FBA Removals | `fba_removals` | Removal Order Detail |
| FC Transfers | `fc_transfers` | Inventory Event Detail (transfers) |
| Shipment Status | `shipment_status` | Inbound Shipments |
| FBA Summary | `fba_summary` | Inventory Ledger - Summary |
| Replacements | `replacements` | Replacements report |
| Adjustments | `adjustments` | Manual upload |
| GNR Report | `gnr_report` | Grade & Resell unit status |
| Payment Repository | `payment_repository` | Date Range Transaction |
| Removal Shipments | `removal_shipments` | Removal Shipment Detail |
| Settlement Report | `settlement_report` | Statements / settlements |

## Reconciliation Formula (MSKU level)

```
expectedQty = shippedQty + receivedQty + returnQty + reimbQty + fcTransferQty
            − soldQty − removalQty
variance    = expectedQty − fbaEndingBalance
```

Single source of truth: `lib/full-reconciliation/formula.ts`.
Per-module formulas live in `lib/<module>-reconciliation/`.

## Shipment Reconciliation

Matches inbound shipments against what FBA received. Per **FNSKU** (scoped by shipment: key `"<shipmentId>|<fnsku>"`, FNSKU-only fallback).

Logic: `lib/shipment-reconciliation-logic.ts`. Display: `lib/shipment-reconciliation-display.ts`.

```
shortage = max(0, shippedQty − receivedQty)
pending  = max(0, shortage − reimbQty)           # reimbQty = Lost_Inbound reimbursements only
effectivePending = max(0, pending − caseContribution − adjMagnitude)
```

Inputs: `shipped_to_fba`, `fba_receipts` (received qty), `reimbursements` (filtered to `reason = "Lost_Inbound"`), `shipment_status` (status + lastUpdated for days-open), plus case/adjustment overlay (FNSKU-keyed).

Base status (`ReconStatus`):

| Status | Meaning |
|---|---|
| `matched` | shortage = 0 and received ≤ shipped |
| `excess` | received > shipped |
| `partial` | shortage > 0 but fully covered by Lost_Inbound reimbursement |
| `case_needed` | shortage > 0 and pending > 0 |

Display badges layer on cases/adjustments: `reimbursed`, `action_taken`, `case_raised`, `in_progress`, `partial_reimb`, `waiting_closed`, `take_action`.

> Known gap: Lost_Inbound reimbursements key on FNSKU only — multi-shipment FNSKUs share one reimbursement pool (`shipment_status` schema lacks shipmentId on reimb rows).

## Removal Reconciliation

Tracks removal orders → shipments → receipts. Per **orderId + FNSKU** (key `"<orderId>|<fnsku>"`). Per-tracking breakdown kept in `TrackingDetail[]`.

Logic: `lib/removal-reconciliation/formula.ts`, `matching.ts`, `aggregate.ts`, `types.ts`.

```
expectedShipped = max(0, requestedQty − cancelledQty − disposedQty)
```

No single variance metric — receipt status is derived from reimbQty, receipt counts, order status, actualShipped, and sellable/unsellable/missing splits.

Inputs: `fba_removals` (quantity, cancelledQty, disposedQty, inProcessQty, orderStatus), `removal_shipments` (shippedQty, carrier, tracking), `removal_receipts` (received/sellable/unsellable/missing/reimb qty), reimbursements (from receipts `rrReimb*`, case-tracker `ctReimb*` fallback), and cases (units/amount approved).

Status (`RemovalReceiptStatusKey`):

| Status | Meaning |
|---|---|
| `REIMBURSED` | reimbQty > 0 |
| `COMPLETE` | received ≥ expectedShipped |
| `PARTIAL` | received > 0 but < expectedShipped |
| `MISSING` | missingQty > 0 |
| `DAMAGED` | unsellable > 0 and sellable = 0 |
| `AWAITING` | order completed + shipped but no receipt yet |
| `NOT_APPLICABLE` | no receipts and order not completed |

## Returns Reconciliation

Verifies customer returns landed back in inventory or were reimbursed. Rewritten status model. Returns aggregate per **orderId + MSKU**; other entities match on FNSKU / ASIN / LPN / orderId as noted below.

Logic: `lib/returns-reconciliation/formula.ts`, `asin-formula.ts`, `matching.ts`, `types.ts`.

Routing paths:

- **GNR MSKU** (prefix `amzn.gr.`) → `GNR_TRACKING` (bridge found) or `UNKNOWN_GNR_CASE`.
- **Amazon "Reimbursed"** → verify by orderId + MSKU → `RESOLVED` or `INVESTIGATE`.
- **"Unit returned to inventory"** (default) → ownership check (orderId + MSKU in sales data), then:
  - *Sellable* → `fba_summary` daily match (MSKU + disposition + returnDate ±1d) → inventory status; GNR-bridge fallback on gap.
  - *Damaged/defective* → reimbursement check; if none, LPN match in GNR → `TRANSFERRED_TO_GNR`.

Windows: `PROCESSING_WINDOW_DAYS = 60` (gaps stay PENDING within 60d), `SUMMARY_TOLERANCE_DAYS = 3` (FbaSummary catch-up grace).

Inputs: `customer_returns` (primary), `reimbursements` (reason-filtered, reversals netted via `originalReimbId`), `gnr_report` (bridge + LPN qty), `fba_summary` (inventory confirm, daily MSKU+disposition+date), `sales_data` (ownership), `cases`, `adjustments`.

Status enums (`lib/returns-reconciliation/types.ts`):

`OwnershipStatus`: `CONFIRMED`, `GNR_TRACKING`, `UNKNOWN_GNR`, `ORDER_NOT_FOUND`
`InventoryStatus`: `IN_INVENTORY`, `NOT_IN_INVENTORY`, `PENDING_SUMMARY`, `NOT_APPLICABLE`
`ReimbStatus`: `REIMBURSED_CASH`, `REIMBURSED_INVENTORY`, `REIMBURSED_UNVERIFIED`, `NOT_REIMBURSED`, `NOT_APPLICABLE`

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

## Conventions

- Soft delete: every business model has `deletedAt`. ALWAYS query with `where: { deletedAt: null }`.
- Server actions return `MutationResult = { ok: true } | { ok: false, error: string }`.
- Formula logic stays out of `actions/` — keep it in `lib/<module>/formula.ts`.
- Zod schemas in `lib/validations/<module>.ts`.
- Decimal fields use `new Prisma.Decimal(value)`.
- Middleware lives in `proxy.ts` (Next.js 16 convention).

## Auth

`AUTH_ENABLED=false` (default in dev): `requireAuth()` in `actions/auth.ts` returns a stub system user — all mutations work without login.

## Migrations

```bash
npx prisma migrate dev --name <change>
npx prisma migrate deploy
```

See `prisma/schema.prisma` for the data model.
