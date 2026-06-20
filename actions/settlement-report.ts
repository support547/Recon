"use server";

import { prisma } from "@/lib/prisma";
import {
  SETTLEMENT_EFFECTIVE_POSTED_MAX,
  SETTLEMENT_VARIABLE_FEE_PER_UNIT,
  normalizeSettlementTab,
  settlementAmountPivotExpr,
  settlementDescExpr,
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

export type SettlementColumnTotals = {
  qty?: number;
  sales?: string;
  fba_fees?: string;
  fba_commission?: string;
  variable_fee?: string;
  other_charges?: string;
  total_amount?: string;
  amount?: string;
};

export type SettlementKpis = {
  unique_orders?: number;
  unique_skus?: number;
  total_qty?: number;
  net_amount?: string | number;
  row_count?: number;
  tx_types?: number;
  settlements?: number;
  totals?: SettlementColumnTotals;
};

export type SettlementOrdersRow = {
  settlement_id: string | null;
  account_type: string | null;
  store: string | null;
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
  account_type: string | null;
  store: string | null;
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
  account_type: string | null;
  store: string | null;
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
  accountType?: string | null;
  store?: string | null;
};

export type SettlementSummaryRow = {
  settlement_id: string;
  account_type: string | null;
  store: string | null;
  start_date: string | null;
  end_date: string | null;
  // Orders section
  order_qty: number;
  order_sales: string;
  order_fba_fees: string;
  order_commission: string;
  order_variable_fee: string;
  order_other: string;
  order_total: string;
  // Refunds section
  refund_qty: number;
  refund_sales: string;
  refund_fba_fees: string;
  refund_commission: string;
  refund_variable_fee: string;
  refund_other: string;
  refund_total: string;
  // Other section
  other_amount: string;
  // Grand net
  net_amount: string;
};

/** GET /api/settlement-report/settlements — list of available settlements. */
export async function getSettlementList(
  filters: { accountType?: string | null; store?: string | null } = {},
): Promise<SettlementListRow[]> {
  const params: unknown[] = [];
  let ex = "";
  if (filters.accountType) {
    params.push(filters.accountType);
    ex += ` AND account_type=$${params.length}`;
  }
  if (filters.store) {
    params.push(filters.store);
    ex += ` AND store=$${params.length}`;
  }
  const sql = `
    SELECT settlement_id,
      TO_CHAR(MIN(settlement_start_date), 'YYYY-MM-DD') AS start_date,
      TO_CHAR(MIN(settlement_end_date),   'YYYY-MM-DD') AS end_date,
      COUNT(*) AS row_count
    FROM settlement_report
    WHERE settlement_id IS NOT NULL AND TRIM(settlement_id) <> ''${ex}
    GROUP BY settlement_id
    ORDER BY MIN(settlement_start_date) DESC NULLS LAST, settlement_id DESC
    LIMIT 100
  `;
  type Raw = {
    settlement_id: string;
    start_date: string | null;
    end_date: string | null;
    row_count: bigint | number;
  };
  const rows = await prisma.$queryRawUnsafe<Raw[]>(sql, ...params);
  return rows.map((r) => ({
    settlement_id: r.settlement_id,
    start_date: r.start_date,
    end_date: r.end_date,
    row_count: Number(r.row_count),
  }));
}

/** GET /api/settlement-report/summary — settlement-wise rollup of orders/refunds/other. */
export async function getSettlementSummary(
  filters: {
    settlementId?: string | null;
    accountType?: string | null;
    store?: string | null;
  } = {},
): Promise<SettlementSummaryRow[]> {
  // Build per-CTE filter clauses. The SQL has three logical scopes
  // (order_qty CTE, refund_qty CTE, main query) each needing the same
  // settlement_id / account_type / store predicate. We share one $-numbered
  // param list and repeat each value once per scope so the placeholder
  // positions line up.
  const baseParams: unknown[] = [];
  const buildScopedClause = (prefix: string): string => {
    let clause = "";
    if (filters.settlementId) {
      baseParams.push(filters.settlementId);
      clause += ` AND ${prefix}settlement_id=$${baseParams.length}`;
    }
    if (filters.accountType) {
      baseParams.push(filters.accountType);
      clause += ` AND ${prefix}account_type=$${baseParams.length}`;
    }
    if (filters.store) {
      baseParams.push(filters.store);
      clause += ` AND ${prefix}store=$${baseParams.length}`;
    }
    return clause;
  };
  const exOrder = buildScopedClause("");
  const exRefund = buildScopedClause("");
  const exMain = buildScopedClause("s.");
  const desc = settlementDescExpr("s.amount_description");
  // Per-section pivoted amount helper. `txPred` filters the row by transaction_type.
  const pivot = (txPred: string, bucket: "sales" | "fba_fees" | "commission" | "variable_fee" | "other" | "total") => {
    const amt = `COALESCE(s.amount, 0)`;
    let inner: string;
    switch (bucket) {
      case "sales":
        inner = `CASE WHEN ${txPred} AND ${desc} = 'principal' THEN ${amt} ELSE 0 END`;
        break;
      case "fba_fees":
        inner = `CASE WHEN ${txPred} AND ${desc} LIKE '%fbaperunitfulfillmentfee%' THEN ${amt} ELSE 0 END`;
        break;
      case "commission":
        inner = `CASE WHEN ${txPred} AND ${desc} = 'commission' THEN ${amt} ELSE 0 END`;
        break;
      case "variable_fee":
        inner = `CASE WHEN ${txPred} AND ${desc} LIKE '%variableclosingfee%' THEN ${amt} ELSE 0 END`;
        break;
      case "other":
        inner = `CASE WHEN ${txPred} AND ${desc} <> 'principal' AND ${desc} <> 'commission' AND ${desc} NOT LIKE '%fbaperunitfulfillmentfee%' AND ${desc} NOT LIKE '%variableclosingfee%' THEN ${amt} ELSE 0 END`;
        break;
      case "total":
        inner = `CASE WHEN ${txPred} THEN ${amt} ELSE 0 END`;
        break;
    }
    return `COALESCE(SUM(${inner}), 0)`;
  };
  const isOrder  = `LOWER(COALESCE(s.transaction_type,'')) LIKE '%order%'`;
  const isRefund = `LOWER(COALESCE(s.transaction_type,'')) LIKE '%refund%'`;
  const isOther  = `LOWER(COALESCE(s.transaction_type,'')) NOT LIKE '%order%' AND LOWER(COALESCE(s.transaction_type,'')) NOT LIKE '%refund%'`;

  const sql = `
    WITH order_qty AS (
      SELECT settlement_id, SUM(qty) AS qty
      FROM (
        SELECT settlement_id, order_id, sku, order_item_code,
               MAX(quantity_purchased) AS qty
        FROM settlement_report
        WHERE LOWER(COALESCE(transaction_type,'')) LIKE '%order%'
          AND settlement_id IS NOT NULL AND TRIM(settlement_id) <> ''
          AND order_id IS NOT NULL AND TRIM(order_id) <> ''${exOrder}
        GROUP BY settlement_id, order_id, sku, order_item_code
      ) q
      GROUP BY settlement_id
    ),
    refund_qty AS (
      SELECT settlement_id,
             SUM(COALESCE(ROUND(ABS(variable_fee::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric, 0), 0))::bigint AS qty
      FROM (
        SELECT settlement_id, order_id, sku, order_item_code,
               SUM(CASE WHEN ${settlementDescExpr("amount_description")} LIKE '%variableclosingfee%' THEN COALESCE(amount, 0) ELSE 0 END) AS variable_fee
        FROM settlement_report
        WHERE LOWER(COALESCE(transaction_type,'')) LIKE '%refund%'
          AND settlement_id IS NOT NULL AND TRIM(settlement_id) <> ''
          AND order_id IS NOT NULL AND TRIM(order_id) <> ''${exRefund}
        GROUP BY settlement_id, order_id, sku, order_item_code
      ) r
      GROUP BY settlement_id
    )
    SELECT
      s.settlement_id,
      MAX(s.account_type) AS account_type,
      MAX(s.store)        AS store,
      TO_CHAR(MIN(s.settlement_start_date), 'YYYY-MM-DD') AS start_date,
      TO_CHAR(MIN(s.settlement_end_date),   'YYYY-MM-DD') AS end_date,
      COALESCE(MAX(oq.qty), 0)::bigint AS order_qty,
      ${pivot(isOrder, "sales")}        AS order_sales,
      ${pivot(isOrder, "fba_fees")}     AS order_fba_fees,
      ${pivot(isOrder, "commission")}   AS order_commission,
      ${pivot(isOrder, "variable_fee")} AS order_variable_fee,
      ${pivot(isOrder, "other")}        AS order_other,
      ${pivot(isOrder, "total")}        AS order_total,
      COALESCE(MAX(rq.qty), 0)::bigint AS refund_qty,
      ${pivot(isRefund, "sales")}        AS refund_sales,
      ${pivot(isRefund, "fba_fees")}     AS refund_fba_fees,
      ${pivot(isRefund, "commission")}   AS refund_commission,
      ${pivot(isRefund, "variable_fee")} AS refund_variable_fee,
      ${pivot(isRefund, "other")}        AS refund_other,
      ${pivot(isRefund, "total")}        AS refund_total,
      COALESCE(SUM(CASE WHEN ${isOther} THEN COALESCE(s.amount, 0) ELSE 0 END), 0) AS other_amount,
      COALESCE(SUM(s.amount), 0) AS net_amount
    FROM settlement_report s
    LEFT JOIN order_qty  oq ON oq.settlement_id = s.settlement_id
    LEFT JOIN refund_qty rq ON rq.settlement_id = s.settlement_id
    WHERE s.settlement_id IS NOT NULL AND TRIM(s.settlement_id) <> ''${exMain}
    GROUP BY s.settlement_id
    ORDER BY MIN(s.settlement_start_date) DESC NULLS LAST, s.settlement_id DESC
  `;
  type Raw = Record<string, unknown>;
  const rows = await prisma.$queryRawUnsafe<Raw[]>(sql, ...baseParams);
  return rows.map((r) => ({
    settlement_id: String(r.settlement_id),
    account_type: (r.account_type as string | null) ?? null,
    store: (r.store as string | null) ?? null,
    start_date: r.start_date as string | null,
    end_date: r.end_date as string | null,
    order_qty: Number(r.order_qty ?? 0),
    order_sales: decimalToStr(r.order_sales),
    order_fba_fees: decimalToStr(r.order_fba_fees),
    order_commission: decimalToStr(r.order_commission),
    order_variable_fee: decimalToStr(r.order_variable_fee),
    order_other: decimalToStr(r.order_other),
    order_total: decimalToStr(r.order_total),
    refund_qty: Number(r.refund_qty ?? 0),
    refund_sales: decimalToStr(r.refund_sales),
    refund_fba_fees: decimalToStr(r.refund_fba_fees),
    refund_commission: decimalToStr(r.refund_commission),
    refund_variable_fee: decimalToStr(r.refund_variable_fee),
    refund_other: decimalToStr(r.refund_other),
    refund_total: decimalToStr(r.refund_total),
    other_amount: decimalToStr(r.other_amount),
    net_amount: decimalToStr(r.net_amount),
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
    ex += ` AND settlement_id=$${params.length}`;
  }
  if (filters.accountType) {
    params.push(filters.accountType);
    ex += ` AND account_type=$${params.length}`;
  }
  if (filters.store) {
    params.push(filters.store);
    ex += ` AND store=$${params.length}`;
  }

  let sql: string;
  if (tab === "orders" || tab === "refunds") {
    const Pk = settlementAmountPivotExpr();
    const kpiRefundQty = `COALESCE(ROUND(ABS(z.variable_fee::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric, 0), 0)::int`;
    sql =
      tab === "refunds"
        ? `
        SELECT
          COUNT(DISTINCT x.order_id)              AS unique_orders,
          COUNT(DISTINCT x.sku)                   AS unique_skus,
          COALESCE(SUM(x.qty), 0)                 AS total_qty,
          COALESCE(SUM(x.item_amt), 0)            AS net_amount,
          COALESCE(SUM(x.sales_amount), 0)        AS sum_sales,
          COALESCE(SUM(x.fba_fees), 0)            AS sum_fba_fees,
          COALESCE(SUM(x.fba_commission), 0)      AS sum_fba_commission,
          COALESCE(SUM(x.variable_fee), 0)        AS sum_variable_fee,
          COALESCE(SUM(x.other_charges), 0)       AS sum_other_charges,
          COALESCE(SUM(x.total_amount), 0)        AS sum_total_amount
        FROM (
          SELECT
            z.order_id,
            z.sku,
            SUM(${kpiRefundQty})  AS qty,
            SUM(z.item_amt)       AS item_amt,
            SUM(z.sales_amount)   AS sales_amount,
            SUM(z.fba_fees)       AS fba_fees,
            SUM(z.fba_commission) AS fba_commission,
            SUM(z.variable_fee)   AS variable_fee,
            SUM(z.other_charges)  AS other_charges,
            SUM(z.total_amount)   AS total_amount
          FROM (
            SELECT order_id, sku, order_item_code,
              SUM(amount)       AS item_amt,
              ${Pk.sales}       AS sales_amount,
              ${Pk.fbaFees}     AS fba_fees,
              ${Pk.commission}  AS fba_commission,
              ${Pk.variableFee} AS variable_fee,
              ${Pk.other}       AS other_charges,
              ${Pk.total}       AS total_amount
            FROM settlement_report
            WHERE ${tw}${ex} AND order_id IS NOT NULL AND TRIM(order_id) <> ''
            GROUP BY order_id, sku, order_item_code
          ) z
          GROUP BY z.order_id, z.sku
        ) x
      `
        : `
        SELECT
          COUNT(DISTINCT order_id)                AS unique_orders,
          COUNT(DISTINCT sku)                     AS unique_skus,
          COALESCE(SUM(x.qty), 0)                 AS total_qty,
          COALESCE(SUM(x.item_amt), 0)            AS net_amount,
          COALESCE(SUM(x.sales_amount), 0)        AS sum_sales,
          COALESCE(SUM(x.fba_fees), 0)            AS sum_fba_fees,
          COALESCE(SUM(x.fba_commission), 0)      AS sum_fba_commission,
          COALESCE(SUM(x.variable_fee), 0)        AS sum_variable_fee,
          COALESCE(SUM(x.other_charges), 0)       AS sum_other_charges,
          COALESCE(SUM(x.total_amount), 0)        AS sum_total_amount
        FROM (
          SELECT order_id, sku, order_item_code,
            MAX(quantity_purchased) AS qty,
            SUM(amount)             AS item_amt,
            ${Pk.sales}             AS sales_amount,
            ${Pk.fbaFees}           AS fba_fees,
            ${Pk.commission}        AS fba_commission,
            ${Pk.variableFee}       AS variable_fee,
            ${Pk.other}             AS other_charges,
            ${Pk.total}             AS total_amount
          FROM settlement_report
          WHERE ${tw}${ex} AND order_id IS NOT NULL AND TRIM(order_id) <> ''
          GROUP BY order_id, sku, order_item_code
        ) x
      `;
  } else {
    sql = `
      SELECT
        COUNT(*)                          AS row_count,
        COUNT(DISTINCT transaction_type)  AS tx_types,
        COALESCE(SUM(amount), 0)          AS net_amount,
        COUNT(DISTINCT settlement_id)     AS settlements,
        COALESCE(SUM(${settlementOtherLineQtyExpr()}), 0) AS sum_qty,
        COALESCE(SUM(amount), 0)          AS sum_amount
      FROM settlement_report WHERE ${tw}${ex}
    `;
  }
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    sql,
    ...params,
  );
  const r = rows[0] ?? {};
  const totals: SettlementColumnTotals =
    tab === "other"
      ? {
          qty: numOrUndef(r.sum_qty),
          amount: strOrUndef(r.sum_amount),
        }
      : {
          qty: numOrUndef(r.total_qty),
          sales: strOrUndef(r.sum_sales),
          fba_fees: strOrUndef(r.sum_fba_fees),
          fba_commission: strOrUndef(r.sum_fba_commission),
          variable_fee: strOrUndef(r.sum_variable_fee),
          other_charges: strOrUndef(r.sum_other_charges),
          total_amount: strOrUndef(r.sum_total_amount),
        };
  return {
    unique_orders: numOrUndef(r.unique_orders),
    unique_skus: numOrUndef(r.unique_skus),
    total_qty: numOrUndef(r.total_qty),
    net_amount: strOrUndef(r.net_amount),
    row_count: numOrUndef(r.row_count),
    tx_types: numOrUndef(r.tx_types),
    settlements: numOrUndef(r.settlements),
    totals,
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
    ex += ` AND settlement_id=$${params.length}`;
  }
  if (filters.accountType) {
    params.push(filters.accountType);
    ex += ` AND account_type=$${params.length}`;
  }
  if (filters.store) {
    params.push(filters.store);
    ex += ` AND store=$${params.length}`;
  }

  let sql: string;
  let cntSql: string;

  if (tab === "orders" || tab === "refunds") {
    const baseFrom = `FROM settlement_report WHERE ${tw}${ex} AND order_id IS NOT NULL AND TRIM(order_id) <> ''`;
    const P = settlementAmountPivotExpr();
    if (tab === "refunds") {
      sql = `
        SELECT
          u.order_id,
          u.sku,
          MAX(u.account_type) AS account_type,
          MAX(u.store)        AS store,
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
            t.account_type,
            t.store,
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
            SELECT settlement_id,
                   MAX(account_type) AS account_type,
                   MAX(store)        AS store,
                   order_id, sku, order_item_code,
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
               MAX(account_type) AS account_type,
               MAX(store)        AS store,
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
      SELECT settlement_id, account_type, store, transaction_type, amount_type, amount_description,
             amount, posted_date, order_id, sku, qty
      FROM (
        SELECT settlement_id, account_type, store, transaction_type, amount_type, amount_description,
               amount,
               CASE
                 WHEN posted_date IS NOT NULL THEN TO_CHAR(posted_date, 'YYYY-MM-DD')
                 WHEN posted_date_time IS NOT NULL THEN TO_CHAR(posted_date_time, 'YYYY-MM-DD')
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
    account_type: strOr(r.account_type),
    store: strOr(r.store),
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
    account_type: strOr(r.account_type),
    store: strOr(r.store),
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
    account_type: strOr(r.account_type),
    store: strOr(r.store),
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
