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
Per-module FNSKU formulas live in `lib/<module>/formula.ts`.

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
