"use server";

import { prisma } from "@/lib/prisma";
import {
  SETTLEMENT_EFFECTIVE_POSTED_MAX,
  SETTLEMENT_VARIABLE_FEE_PER_UNIT,
  settlementAmountPivotExpr,
  settlementTabFilter,
} from "@/lib/settlement/helpers";

export type SalesReconRollupRow = {
  order_id: string;
  sku_norm: string;
  settlement_ids: string[];
  qty: number;
  sales_amount: string;
  fba_fees: string;
  fba_commission: string;
  variable_fee: string;
  other_charges: string;
  total_amount: string;
};

export type SalesReconRollupResult = {
  orders: SalesReconRollupRow[];
  refunds: SalesReconRollupRow[];
};

/** GET /api/sales-recon/settlement-rollup — orders + refunds rolled up by normalized (order_id, sku). */
export async function getSalesReconRollup(): Promise<SalesReconRollupResult> {
  const P = settlementAmountPivotExpr();
  const twOrders = settlementTabFilter("orders");
  const twRefunds = settlementTabFilter("refunds");
  const baseOrders = `FROM settlement_report WHERE ${twOrders} AND order_id IS NOT NULL AND TRIM(COALESCE(order_id::text,'')) <> ''`;
  const baseRefunds = `FROM settlement_report WHERE ${twRefunds} AND order_id IS NOT NULL AND TRIM(COALESCE(order_id::text,'')) <> ''`;
  const oidExpr = `TRIM(REPLACE(REPLACE(COALESCE(order_id::text, ''), CHR(160), ''), CHR(65279), ''))`;
  const skuExpr = `LOWER(TRIM(REPLACE(REPLACE(COALESCE(sku::text, ''), CHR(160), ''), CHR(65279), '')))`;

  const ordersSql = `
    WITH t AS (
      SELECT settlement_id,
             ${SETTLEMENT_EFFECTIVE_POSTED_MAX} AS posted_date,
             order_id, sku, order_item_code,
             MAX(quantity_purchased) AS qty,
             ${P.sales} AS sales_amount,
             ${P.fbaFees} AS fba_fees,
             ${P.commission} AS fba_commission,
             ${P.variableFee} AS variable_fee,
             ${P.other} AS other_charges,
             ${P.total} AS total_amount
      ${baseOrders}
      GROUP BY settlement_id, order_id, sku, order_item_code
    )
    SELECT
      ${oidExpr} AS order_id,
      ${skuExpr} AS sku_norm,
      COALESCE(array_agg(DISTINCT NULLIF(TRIM(settlement_id::text), '')), ARRAY[]::text[]) AS settlement_ids,
      SUM(qty)::bigint AS qty,
      SUM(sales_amount)::numeric(16,4) AS sales_amount,
      SUM(fba_fees)::numeric(16,4) AS fba_fees,
      SUM(fba_commission)::numeric(16,4) AS fba_commission,
      SUM(variable_fee)::numeric(16,4) AS variable_fee,
      SUM(other_charges)::numeric(16,4) AS other_charges,
      SUM(total_amount)::numeric(16,4) AS total_amount
    FROM t
    GROUP BY ${oidExpr}, ${skuExpr}
    ORDER BY ${oidExpr}, ${skuExpr}
  `;

  const refundsSql = `
    WITH u AS (
      SELECT
        t.settlement_id,
        t.posted_date,
        t.order_id,
        t.sku,
        t.order_item_code,
        COALESCE(
          ROUND(ABS(t.variable_fee::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric, 0),
          0
        )::int AS line_qty,
        t.sales_amount,
        t.fba_fees,
        t.fba_commission,
        t.variable_fee,
        t.other_charges,
        t.total_amount
      FROM (
        SELECT settlement_id, order_id, sku, order_item_code,
               ${SETTLEMENT_EFFECTIVE_POSTED_MAX} AS posted_date,
               ${P.sales} AS sales_amount,
               ${P.fbaFees} AS fba_fees,
               ${P.commission} AS fba_commission,
               ${P.variableFee} AS variable_fee,
               ${P.other} AS other_charges,
               ${P.total} AS total_amount
        ${baseRefunds}
        GROUP BY settlement_id, order_id, sku, order_item_code
      ) t
    )
    SELECT
      ${oidExpr} AS order_id,
      ${skuExpr} AS sku_norm,
      COALESCE(array_agg(DISTINCT NULLIF(TRIM(settlement_id::text), '')), ARRAY[]::text[]) AS settlement_ids,
      SUM(line_qty)::bigint AS qty,
      SUM(sales_amount)::numeric(16,4) AS sales_amount,
      SUM(fba_fees)::numeric(16,4) AS fba_fees,
      SUM(fba_commission)::numeric(16,4) AS fba_commission,
      SUM(variable_fee)::numeric(16,4) AS variable_fee,
      SUM(other_charges)::numeric(16,4) AS other_charges,
      SUM(total_amount)::numeric(16,4) AS total_amount
    FROM u
    GROUP BY ${oidExpr}, ${skuExpr}
    ORDER BY ${oidExpr}, ${skuExpr}
  `;

  const [orders, refunds] = await Promise.all([
    prisma.$queryRawUnsafe<Record<string, unknown>[]>(ordersSql),
    prisma.$queryRawUnsafe<Record<string, unknown>[]>(refundsSql),
  ]);

  return {
    orders: orders.map(serialize),
    refunds: refunds.map(serialize),
  };
}

function serialize(r: Record<string, unknown>): SalesReconRollupRow {
  return {
    order_id: String(r.order_id ?? ""),
    sku_norm: String(r.sku_norm ?? ""),
    settlement_ids: Array.isArray(r.settlement_ids)
      ? (r.settlement_ids as unknown[]).filter(Boolean).map((s) => String(s))
      : [],
    qty: Number(r.qty ?? 0),
    sales_amount: decimalToStr(r.sales_amount),
    fba_fees: decimalToStr(r.fba_fees),
    fba_commission: decimalToStr(r.fba_commission),
    variable_fee: decimalToStr(r.variable_fee),
    other_charges: decimalToStr(r.other_charges),
    total_amount: decimalToStr(r.total_amount),
  };
}

function decimalToStr(v: unknown): string {
  if (v == null) return "0";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}
