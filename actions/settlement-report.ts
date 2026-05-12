"use server";

import { prisma } from "@/lib/prisma";
import {
  SETTLEMENT_EFFECTIVE_POSTED_MAX,
  SETTLEMENT_VARIABLE_FEE_PER_UNIT,
  normalizeSettlementTab,
  settlementAmountPivotExpr,
  settlementOtherLineQtyExpr,
  settlementTabFilter,
  type SettlementTab,
} from "@/lib/settlement/helpers";

export type SettlementListRow = {
  settlement_id: string;
  start_date: string | null;
  end_date: string | null;
  row_count: number;
};

export type SettlementKpis = {
  unique_orders?: number;
  unique_skus?: number;
  total_qty?: number;
  net_amount?: string | number;
  row_count?: number;
  tx_types?: number;
  settlements?: number;
};

export type SettlementOrdersRow = {
  settlement_id: string | null;
  posted_date: string | null;
  order_id: string | null;
  sku: string | null;
  order_item_code: string | null;
  qty: number;
  sales_amount: string;
  fba_fees: string;
  fba_commission: string;
  variable_fee: string;
  other_charges: string;
  total_amount: string;
};

export type SettlementRefundsRow = {
  order_id: string | null;
  sku: string | null;
  qty: number;
  sales_amount: string;
  fba_fees: string;
  fba_commission: string;
  variable_fee: string;
  other_charges: string;
  total_amount: string;
  posted_date: string | null;
  refund_breakdown: Array<{
    settlement_id: string | null;
    order_item_code: string | null;
    qty: number;
    posted_date: string | null;
  }>;
};

export type SettlementOtherRow = {
  settlement_id: string | null;
  transaction_type: string | null;
  amount_type: string | null;
  amount_description: string | null;
  amount: string;
  posted_date: string | null;
  order_id: string | null;
  sku: string | null;
  qty: number;
};

export type SettlementRowsResult<T> = {
  rows: T[];
  total: number;
  page: number;
  limit: number;
};

export type SettlementFilters = {
  settlementId?: string | null;
  tab?: string | null;
  page?: number;
  limit?: number;
};

/** GET /api/settlement-report/settlements — list of available settlements. */
export async function getSettlementList(): Promise<SettlementListRow[]> {
  const sql = `
    SELECT settlement_id,
      MIN(settlement_start_date) AS start_date,
      MIN(settlement_end_date)   AS end_date,
      COUNT(*) AS row_count
    FROM settlement_report
    WHERE settlement_id IS NOT NULL AND settlement_id <> ''
    GROUP BY settlement_id
    ORDER BY settlement_id DESC
    LIMIT 100
  `;
  type Raw = {
    settlement_id: string;
    start_date: string | null;
    end_date: string | null;
    row_count: bigint | number;
  };
  const rows = await prisma.$queryRawUnsafe<Raw[]>(sql);
  return rows.map((r) => ({
    settlement_id: r.settlement_id,
    start_date: r.start_date,
    end_date: r.end_date,
    row_count: Number(r.row_count),
  }));
}

/** GET /api/settlement-report/kpis */
export async function getSettlementKpis(
  filters: SettlementFilters = {},
): Promise<SettlementKpis> {
  const tab = normalizeSettlementTab(filters.tab);
  const tw = settlementTabFilter(tab);
  const params: unknown[] = [];
  let ex = "";
  if (filters.settlementId) {
    params.push(filters.settlementId);
    ex = ` AND settlement_id=$${params.length}`;
  }

  let sql: string;
  if (tab === "orders" || tab === "refunds") {
    const Pk = settlementAmountPivotExpr();
    const kpiRefundQty = `COALESCE(ROUND(ABS(z.variable_fee::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric, 0), 0)::int`;
    sql =
      tab === "refunds"
        ? `
        SELECT
          COUNT(DISTINCT x.order_id) AS unique_orders,
          COUNT(DISTINCT x.sku)     AS unique_skus,
          SUM(x.qty)                 AS total_qty,
          SUM(x.item_amt)            AS net_amount
        FROM (
          SELECT
            z.order_id,
            z.sku,
            SUM(${kpiRefundQty}) AS qty,
            SUM(z.item_amt)      AS item_amt
          FROM (
            SELECT order_id, sku, order_item_code,
              SUM(amount) AS item_amt,
              ${Pk.variableFee} AS variable_fee
            FROM settlement_report
            WHERE ${tw}${ex} AND order_id IS NOT NULL AND order_id <> ''
            GROUP BY order_id, sku, order_item_code
          ) z
          GROUP BY z.order_id, z.sku
        ) x
      `
        : `
        SELECT
          COUNT(DISTINCT order_id)  AS unique_orders,
          COUNT(DISTINCT sku)       AS unique_skus,
          SUM(x.qty)                AS total_qty,
          SUM(x.item_amt)           AS net_amount
        FROM (
          SELECT order_id, sku, order_item_code,
            MAX(quantity_purchased) AS qty,
            SUM(amount)             AS item_amt
          FROM settlement_report
          WHERE ${tw}${ex} AND order_id IS NOT NULL AND order_id <> ''
          GROUP BY order_id, sku, order_item_code
        ) x
      `;
  } else {
    sql = `
      SELECT
        COUNT(*)                        AS row_count,
        COUNT(DISTINCT transaction_type) AS tx_types,
        SUM(amount)                     AS net_amount,
        COUNT(DISTINCT settlement_id)   AS settlements
      FROM settlement_report WHERE ${tw}${ex}
    `;
  }
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    sql,
    ...params,
  );
  const r = rows[0] ?? {};
  return {
    unique_orders: numOrUndef(r.unique_orders),
    unique_skus: numOrUndef(r.unique_skus),
    total_qty: numOrUndef(r.total_qty),
    net_amount: strOrUndef(r.net_amount),
    row_count: numOrUndef(r.row_count),
    tx_types: numOrUndef(r.tx_types),
    settlements: numOrUndef(r.settlements),
  };
}

/** GET /api/settlement-report — paginated rows for orders / refunds / other tab. */
export async function getSettlementRows(
  filters: SettlementFilters = {},
): Promise<
  | SettlementRowsResult<SettlementOrdersRow>
  | SettlementRowsResult<SettlementRefundsRow>
  | SettlementRowsResult<SettlementOtherRow>
> {
  const tab = normalizeSettlementTab(filters.tab);
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(500, Math.max(10, filters.limit ?? 100));
  const offset = (page - 1) * limit;
  const tw = settlementTabFilter(tab);
  const params: unknown[] = [];
  let ex = "";
  if (filters.settlementId) {
    params.push(filters.settlementId);
    ex = ` AND settlement_id=$${params.length}`;
  }

  let sql: string;
  let cntSql: string;

  if (tab === "orders" || tab === "refunds") {
    const baseFrom = `FROM settlement_report WHERE ${tw}${ex} AND order_id IS NOT NULL AND order_id <> ''`;
    const P = settlementAmountPivotExpr();
    if (tab === "refunds") {
      sql = `
        SELECT
          u.order_id,
          u.sku,
          SUM(u.line_qty)::bigint AS qty,
          SUM(u.sales_amount)::numeric(16,4)    AS sales_amount,
          SUM(u.fba_fees)::numeric(16,4)       AS fba_fees,
          SUM(u.fba_commission)::numeric(16,4)  AS fba_commission,
          SUM(u.variable_fee)::numeric(16,4)    AS variable_fee,
          SUM(u.other_charges)::numeric(16,4)   AS other_charges,
          SUM(u.total_amount)::numeric(16,4)    AS total_amount,
          MAX(u.posted_date) AS posted_date,
          jsonb_agg(
            jsonb_build_object(
              'settlement_id', NULLIF(TRIM(u.settlement_id::text), ''),
              'order_item_code', NULLIF(TRIM(u.order_item_code::text), ''),
              'qty', u.line_qty,
              'posted_date', u.posted_date
            )
            ORDER BY u.posted_date DESC NULLS LAST, u.settlement_id::text DESC NULLS LAST
          ) AS refund_breakdown
        FROM (
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
                   ${P.sales}       AS sales_amount,
                   ${P.fbaFees}     AS fba_fees,
                   ${P.commission}  AS fba_commission,
                   ${P.variableFee} AS variable_fee,
                   ${P.other}       AS other_charges,
                   ${P.total}       AS total_amount
            ${baseFrom}
            GROUP BY settlement_id, order_id, sku, order_item_code
          ) t
        ) u
        GROUP BY u.order_id, u.sku
        ORDER BY MAX(u.posted_date) DESC NULLS LAST, u.order_id, u.sku
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      cntSql = `SELECT COUNT(*)::bigint AS total FROM (
                  SELECT u.order_id, u.sku
                  FROM (
                    SELECT settlement_id, order_id, sku, order_item_code
                    ${baseFrom}
                    GROUP BY settlement_id, order_id, sku, order_item_code
                  ) u
                  GROUP BY u.order_id, u.sku
                ) c`;
    } else {
      sql = `
        SELECT settlement_id,
               ${SETTLEMENT_EFFECTIVE_POSTED_MAX} AS posted_date,
               order_id, sku, order_item_code,
               MAX(quantity_purchased) AS qty,
               ${P.sales}       AS sales_amount,
               ${P.fbaFees}     AS fba_fees,
               ${P.commission}  AS fba_commission,
               ${P.variableFee} AS variable_fee,
               ${P.other}       AS other_charges,
               ${P.total}       AS total_amount
        ${baseFrom}
        GROUP BY settlement_id, order_id, sku, order_item_code
        ORDER BY ${SETTLEMENT_EFFECTIVE_POSTED_MAX} DESC NULLS LAST, settlement_id DESC, order_id, sku
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      cntSql = `SELECT COUNT(*) AS total FROM (SELECT 1 ${baseFrom} GROUP BY settlement_id, order_id, sku, order_item_code) s`;
    }
  } else {
    sql = `
      SELECT settlement_id, transaction_type, amount_type, amount_description,
             amount, posted_date, order_id, sku, qty
      FROM (
        SELECT settlement_id, transaction_type, amount_type, amount_description,
               amount,
               CASE
                 WHEN TRIM(COALESCE(posted_date::text, '')) <> '' THEN TRIM(posted_date::text)
                 WHEN TRIM(COALESCE(posted_date_time::text, '')) <> '' THEN TRIM(SPLIT_PART(REGEXP_REPLACE(TRIM(posted_date_time::text), 'T', ' '), ' ', 1))
                 ELSE NULL
               END AS posted_date,
               order_id, sku,
               ${settlementOtherLineQtyExpr()} AS qty,
               id AS _sort_id
        FROM settlement_report WHERE ${tw}${ex}
      ) u
      ORDER BY u.posted_date DESC NULLS LAST, u.settlement_id DESC, u.transaction_type, u.amount_type, u.amount_description, u._sort_id
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    cntSql = `SELECT COUNT(*) AS total FROM settlement_report WHERE ${tw}${ex}`;
  }

  const cntParams = [...params];
  params.push(limit, offset);
  const [data, count] = await Promise.all([
    prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params),
    prisma.$queryRawUnsafe<Array<{ total: bigint | number }>>(cntSql, ...cntParams),
  ]);
  const total = Number(count[0]?.total ?? 0);

  if (tab === "refunds") {
    return {
      rows: data.map(serializeRefundRow),
      total,
      page,
      limit,
    } as SettlementRowsResult<SettlementRefundsRow>;
  }
  if (tab === "orders") {
    return {
      rows: data.map(serializeOrdersRow),
      total,
      page,
      limit,
    } as SettlementRowsResult<SettlementOrdersRow>;
  }
  return {
    rows: data.map(serializeOtherRow),
    total,
    page,
    limit,
  } as SettlementRowsResult<SettlementOtherRow>;
}

function serializeOrdersRow(r: Record<string, unknown>): SettlementOrdersRow {
  return {
    settlement_id: strOr(r.settlement_id),
    posted_date: strOr(r.posted_date),
    order_id: strOr(r.order_id),
    sku: strOr(r.sku),
    order_item_code: strOr(r.order_item_code),
    qty: Number(r.qty ?? 0),
    sales_amount: decimalToStr(r.sales_amount),
    fba_fees: decimalToStr(r.fba_fees),
    fba_commission: decimalToStr(r.fba_commission),
    variable_fee: decimalToStr(r.variable_fee),
    other_charges: decimalToStr(r.other_charges),
    total_amount: decimalToStr(r.total_amount),
  };
}

function serializeRefundRow(r: Record<string, unknown>): SettlementRefundsRow {
  const breakdown = Array.isArray(r.refund_breakdown)
    ? (r.refund_breakdown as Array<Record<string, unknown>>).map((b) => ({
        settlement_id: strOr(b.settlement_id),
        order_item_code: strOr(b.order_item_code),
        qty: Number(b.qty ?? 0),
        posted_date: strOr(b.posted_date),
      }))
    : [];
  return {
    order_id: strOr(r.order_id),
    sku: strOr(r.sku),
    qty: Number(r.qty ?? 0),
    sales_amount: decimalToStr(r.sales_amount),
    fba_fees: decimalToStr(r.fba_fees),
    fba_commission: decimalToStr(r.fba_commission),
    variable_fee: decimalToStr(r.variable_fee),
    other_charges: decimalToStr(r.other_charges),
    total_amount: decimalToStr(r.total_amount),
    posted_date: strOr(r.posted_date),
    refund_breakdown: breakdown,
  };
}

function serializeOtherRow(r: Record<string, unknown>): SettlementOtherRow {
  return {
    settlement_id: strOr(r.settlement_id),
    transaction_type: strOr(r.transaction_type),
    amount_type: strOr(r.amount_type),
    amount_description: strOr(r.amount_description),
    amount: decimalToStr(r.amount),
    posted_date: strOr(r.posted_date),
    order_id: strOr(r.order_id),
    sku: strOr(r.sku),
    qty: Number(r.qty ?? 0),
  };
}

function strOr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s === "" ? null : s;
}

function strOrUndef(v: unknown): string | undefined {
  if (v == null) return undefined;
  return String(v);
}

function numOrUndef(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function decimalToStr(v: unknown): string {
  if (v == null) return "0";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}
