"use server";

import { prisma } from "@/lib/prisma";
import {
  SETTLEMENT_EFFECTIVE_POSTED_MAX,
  SETTLEMENT_VARIABLE_FEE_PER_UNIT,
  settlementAmountPivotExpr,
  settlementTabFilter,
} from "@/lib/settlement/helpers";

export type SalesOrderFilters = {
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type SettlementBreakdownEntry = {
  settlement_id: string | null;
  qty: number;
  posted_date: string | null;
};

export type RefundBreakdownEntry = {
  settlement_id: string | null;
  posted_date: string | null;
  qty: number;
};

export type ShippedCostBreakdown = {
  final_net_price_usd: number | null;
  commission_usd: number | null;
  supplier_shipping_usd: number | null;
  warehouse_prep_usd: number | null;
  inventory_place_inbound_usd: number | null;
  expert_charges_usd: number | null;
  other_charges_usd: number | null;
};

export type SalesOrderRow = {
  order_id: string;
  sku: string;
  qty: number;
  currency: string;
  sales_rpt_gross: string;
  sale_first: string | null;
  sale_last: string | null;
  sale_span_days: number | null;
  settlement_qty_breakdown: SettlementBreakdownEntry[] | null;
  st_qty: number | null;
  st_sales: string | null;
  st_fba_fees: string | null;
  st_fba_commission: string | null;
  st_variable_fee: string | null;
  st_other_charges: string | null;
  st_total: string | null;
  has_settlement_breakdown: boolean;
  amount: string;
  purchase_id: string | null;
  listing_title: string | null;
  asin: string | null;
  publisher: string | null;
  delivery_location: string | null;
  shipped_per_book_usd: number | null;
  shipped_cost_breakdown: ShippedCostBreakdown | null;
  has_shipped_cost_tooltip: boolean;
  per_book_profit_usd: number | null;
  refund_qty: number | null;
  refund_total: string | null;
  refund_sales: string | null;
  refund_fba_fees: string | null;
  refund_fba_commission: string | null;
  refund_variable_fee: string | null;
  refund_other_charges: string | null;
  refund_qty_breakdown: RefundBreakdownEntry[] | null;
  has_refund_breakdown: boolean;
  order_settlement_ids: string[] | null;
  settlement_posted_min: string | null;
  settlement_posted_max: string | null;
  final_qty: number;
  final_amount: string;
};

export type SalesOrdersPayload = {
  rows: SalesOrderRow[];
  total: number;
  limit: number;
  offset: number;
  sum_qty: number;
  sum_refund_qty: number;
  sum_amount: number;
  sum_refund_total: number;
  sum_final_qty: number;
  sum_final_amount: number;
  sum_book_profit_total: number;
  sum_amount_currency: string;
};

const SORT_MAP: Record<string, string> = {
  order_id: "sa.order_id",
  sku: "sa.sku",
  qty: "sa.qty",
  amount: "sa.amount",
  sale_last: "sa.sale_last",
  refund_qty: "sa.refund_qty",
  refund_total: "sa.refund_total",
  delivery_location: "sa.delivery_location",
  final_qty: "(sa.qty - COALESCE(sa.refund_qty, 0))",
  final_amount: "(sa.amount + COALESCE(sa.refund_total, 0))",
  per_book_shipped: "sa.shipped_per_book_usd",
  per_book_profit: "sa.per_book_profit_usd",
  settlement_posted: "sa.settlement_posted_max",
};

function normMsku(col: string): string {
  return `LOWER(TRIM(BOTH FROM REPLACE(REPLACE(TRIM(COALESCE(${col}, '')), CHR(160), ''), CHR(65279), '')))`;
}

function normAsin(col: string): string {
  return `NULLIF(LOWER(TRIM(BOTH FROM REPLACE(REPLACE(TRIM(COALESCE(${col}::text, '')), CHR(160), ''), CHR(65279), ''))), '')`;
}

/** Build the joined_with_profit CTE — verbatim port of HTML server.js buildSalesOrdersJoinedWithProfitCte. */
function buildJoinedWithProfitCte(): string {
  const stTab = settlementTabFilter("orders");
  const stRefTab = settlementTabFilter("refunds");
  const P = settlementAmountPivotExpr();
  return `
    WITH sales_agg AS (
      SELECT
        order_id,
        msku AS sku,
        MAX(${normMsku("msku")}) AS sku_norm_key,
        MAX(${normAsin("asin")}) AS sale_asin_norm,
        SUM(quantity)::bigint AS qty,
        MAX(COALESCE(NULLIF(TRIM(currency), ''), 'USD')) AS currency,
        SUM(COALESCE(product_amount,0) + COALESCE(shipping_amount,0) + COALESCE(gift_amount,0))::numeric(14,4) AS sales_rpt_gross,
        MIN(sale_date) AS sale_first,
        MAX(sale_date) AS sale_last,
        (MAX(sale_date::date) - MIN(sale_date::date))::int AS sale_span_days
      FROM sales_data
      WHERE TRIM(COALESCE(order_id, '')) <> '' AND TRIM(COALESCE(msku, '')) <> ''
      GROUP BY order_id, msku
    ),
    sr_order_line AS (
      SELECT
        settlement_id,
        order_id,
        LOWER(TRIM(COALESCE(sku, ''))) AS sku_norm,
        order_item_code,
        ${SETTLEMENT_EFFECTIVE_POSTED_MAX} AS line_posted_date,
        MAX(COALESCE(quantity_purchased, 0))::bigint AS line_qty,
        ${P.sales} AS line_sales,
        ${P.fbaFees} AS line_fba,
        ${P.commission} AS line_commission,
        ${P.variableFee} AS line_var,
        ${P.other} AS line_other,
        ${P.total} AS line_total,
        MAX(NULLIF(TRIM(COALESCE(currency::text, '')), '')) AS line_currency
      FROM settlement_report
      WHERE (${stTab})
        AND TRIM(COALESCE(order_id, '')) <> ''
        AND TRIM(COALESCE(sku, '')) <> ''
      GROUP BY settlement_id, order_id, LOWER(TRIM(COALESCE(sku, ''))), order_item_code
    ),
    sr_order_sku_agg AS (
      SELECT
        order_id,
        sku_norm,
        SUM(line_qty) AS st_qty,
        SUM(line_sales) AS st_sales,
        SUM(line_fba) AS st_fba_fees,
        SUM(line_commission) AS st_fba_commission,
        SUM(line_var) AS st_variable_fee,
        SUM(line_other) AS st_other_charges,
        SUM(line_total) AS st_total,
        MAX(NULLIF(TRIM(line_currency::text), '')) AS st_currency,
        MIN(line_posted_date) AS settlement_posted_min,
        MAX(line_posted_date) AS settlement_posted_max
      FROM sr_order_line
      GROUP BY order_id, sku_norm
    ),
    settlement_report_qty_agg AS (
      SELECT
        order_id,
        sku_norm,
        jsonb_agg(
          jsonb_build_object(
            'settlement_id', NULLIF(TRIM(sid::text), ''),
            'qty', settle_qty,
            'posted_date', NULLIF(TRIM(posted_date::text), '')
          ) ORDER BY posted_date DESC NULLS LAST, sid::text NULLS LAST
        ) AS settlements
      FROM (
        SELECT
          order_id,
          sku_norm,
          settlement_id AS sid,
          SUM(line_qty)::bigint AS settle_qty,
          MAX(line_posted_date) AS posted_date
        FROM sr_order_line
        GROUP BY order_id, sku_norm, settlement_id
      ) u
      GROUP BY order_id, sku_norm
    ),
    refund_sr_line AS (
      SELECT
        settlement_id,
        order_id,
        LOWER(TRIM(COALESCE(sku, ''))) AS sku_norm,
        order_item_code,
        ${SETTLEMENT_EFFECTIVE_POSTED_MAX} AS line_posted_date,
        ${P.sales} AS line_sales,
        ${P.fbaFees} AS line_fba,
        ${P.commission} AS line_commission,
        ${P.variableFee} AS line_var,
        ${P.other} AS line_other,
        ${P.total} AS line_total
      FROM settlement_report
      WHERE (${stRefTab})
        AND TRIM(COALESCE(order_id, '')) <> ''
        AND TRIM(COALESCE(sku, '')) <> ''
      GROUP BY settlement_id, order_id, LOWER(TRIM(COALESCE(sku, ''))), order_item_code
    ),
    refund_order_sku_agg AS (
      SELECT
        order_id,
        sku_norm,
        SUM(COALESCE(ROUND(ABS(line_var::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric, 0), 0)::bigint) AS refund_qty,
        SUM(line_total) AS refund_total,
        SUM(line_sales) AS refund_sales,
        SUM(line_fba) AS refund_fba_fees,
        SUM(line_commission) AS refund_fba_commission,
        SUM(line_var) AS refund_variable_fee,
        SUM(line_other) AS refund_other_charges,
        jsonb_agg(
          jsonb_build_object(
            'settlement_id', NULLIF(TRIM(settlement_id::text), ''),
            'posted_date', NULLIF(TRIM(line_posted_date::text), ''),
            'qty', COALESCE(ROUND(ABS(line_var::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric, 0), 0)::int
          ) ORDER BY line_posted_date DESC NULLS LAST, settlement_id::text DESC NULLS LAST
        ) AS refund_qty_breakdown
      FROM refund_sr_line
      GROUP BY order_id, sku_norm
    ),
    order_settlement_ids AS (
      SELECT
        norm_oid,
        jsonb_agg(sid ORDER BY sid::text NULLS LAST) AS settlement_ids_for_order
      FROM (
        SELECT DISTINCT
          TRIM(REPLACE(REPLACE(COALESCE(order_id::text, ''), CHR(160), ''), CHR(65279), '')) AS norm_oid,
          NULLIF(TRIM(settlement_id::text), '') AS sid
        FROM settlement_report
        WHERE ((${stTab}) OR (${stRefTab}))
          AND TRIM(COALESCE(order_id, '')) <> ''
          AND NULLIF(TRIM(settlement_id::text), '') IS NOT NULL
      ) u
      WHERE norm_oid <> ''
      GROUP BY norm_oid
    ),
    shipped_sku_lookup AS (
      SELECT DISTINCT ON (${normMsku("msku")})
        ${normMsku("msku")} AS msku_norm,
        NULLIF(TRIM(purchase_id::text), '') AS purchase_id,
        NULLIF(TRIM(COALESCE(title, '')), '') AS listing_title,
        NULLIF(TRIM(COALESCE(asin, '')), '') AS asin,
        NULLIF(TRIM(COALESCE(publisher_name, '')), '') AS publisher,
        NULLIF(TRIM(COALESCE(delivery_location, '')), '') AS delivery_location,
        per_book_cost_usd,
        final_net_price_usd, commission_usd, supplier_shipping_usd, warehouse_prep_usd,
        inventory_place_inbound_usd, expert_charges_usd, other_charges_usd
      FROM shipped_to_fba
      WHERE TRIM(COALESCE(msku, '')) <> ''
      ORDER BY ${normMsku("msku")}, ship_date DESC NULLS LAST, id DESC
    ),
    shipped_asin_lookup AS (
      SELECT DISTINCT ON (${normAsin("asin")})
        ${normAsin("asin")} AS asin_norm,
        NULLIF(TRIM(purchase_id::text), '') AS purchase_id,
        NULLIF(TRIM(COALESCE(title, '')), '') AS listing_title,
        NULLIF(TRIM(COALESCE(asin, '')), '') AS asin,
        NULLIF(TRIM(COALESCE(publisher_name, '')), '') AS publisher,
        NULLIF(TRIM(COALESCE(delivery_location, '')), '') AS delivery_location,
        per_book_cost_usd,
        final_net_price_usd, commission_usd, supplier_shipping_usd, warehouse_prep_usd,
        inventory_place_inbound_usd, expert_charges_usd, other_charges_usd
      FROM shipped_to_fba
      WHERE ${normAsin("asin")} IS NOT NULL
      ORDER BY ${normAsin("asin")}, ship_date DESC NULLS LAST, id DESC
    ),
    joined AS (
      SELECT
        sa.order_id,
        sa.sku,
        sa.qty,
        COALESCE(
          NULLIF(TRIM(sr.st_currency::text), ''),
          NULLIF(TRIM(sa.currency::text), ''),
          'USD'
        ) AS currency,
        sa.sales_rpt_gross,
        sa.sale_first,
        sa.sale_last,
        sa.sale_span_days,
        sr.st_qty,
        sr.st_sales,
        sr.st_fba_fees,
        sr.st_fba_commission,
        sr.st_variable_fee,
        sr.st_other_charges,
        sr.st_total,
        sr.settlement_posted_min,
        sr.settlement_posted_max,
        ps.settlements AS settlement_qty_breakdown,
        (sr.order_id IS NOT NULL) AS has_settlement_breakdown,
        CASE WHEN sr.order_id IS NOT NULL THEN sr.st_total ELSE sa.sales_rpt_gross END AS amount,
        COALESCE(shf.purchase_id, sha.purchase_id) AS purchase_id,
        COALESCE(shf.listing_title, sha.listing_title) AS listing_title,
        COALESCE(shf.asin, sha.asin) AS asin,
        COALESCE(shf.publisher, sha.publisher) AS publisher,
        COALESCE(shf.delivery_location, sha.delivery_location) AS delivery_location,
        COALESCE(shf.per_book_cost_usd, sha.per_book_cost_usd) AS sh_stored_per_book_usd,
        COALESCE(shf.final_net_price_usd, sha.final_net_price_usd) AS sh_final_net_price_usd,
        COALESCE(shf.commission_usd, sha.commission_usd) AS sh_commission_usd,
        COALESCE(shf.supplier_shipping_usd, sha.supplier_shipping_usd) AS sh_supplier_shipping_usd,
        COALESCE(shf.warehouse_prep_usd, sha.warehouse_prep_usd) AS sh_warehouse_prep_usd,
        COALESCE(shf.inventory_place_inbound_usd, sha.inventory_place_inbound_usd) AS sh_inventory_place_inbound_usd,
        COALESCE(shf.expert_charges_usd, sha.expert_charges_usd) AS sh_expert_charges_usd,
        COALESCE(shf.other_charges_usd, sha.other_charges_usd) AS sh_other_charges_usd,
        CASE
          WHEN shf.msku_norm IS NULL AND sha.asin_norm IS NULL THEN NULL
          ELSE COALESCE(
            COALESCE(shf.per_book_cost_usd, sha.per_book_cost_usd),
            COALESCE(COALESCE(shf.final_net_price_usd, sha.final_net_price_usd), 0)::numeric
              + COALESCE(COALESCE(shf.commission_usd, sha.commission_usd), 0)::numeric
              + COALESCE(COALESCE(shf.supplier_shipping_usd, sha.supplier_shipping_usd), 0)::numeric
              + COALESCE(COALESCE(shf.warehouse_prep_usd, sha.warehouse_prep_usd), 0)::numeric
              + COALESCE(COALESCE(shf.inventory_place_inbound_usd, sha.inventory_place_inbound_usd), 0)::numeric
              + COALESCE(COALESCE(shf.expert_charges_usd, sha.expert_charges_usd), 0)::numeric
              + COALESCE(COALESCE(shf.other_charges_usd, sha.other_charges_usd), 0)::numeric
          )
        END AS shipped_per_book_usd,
        rf.refund_qty,
        rf.refund_total,
        rf.refund_sales,
        rf.refund_fba_fees,
        rf.refund_fba_commission,
        rf.refund_variable_fee,
        rf.refund_other_charges,
        rf.refund_qty_breakdown,
        (COALESCE(rf.refund_qty, 0) > 0 OR COALESCE(rf.refund_total, 0) <> 0) AS has_refund_breakdown,
        osi.settlement_ids_for_order AS order_settlement_ids,
        shf.msku_norm AS shf_msku_norm,
        sha.asin_norm AS sha_asin_norm
      FROM sales_agg sa
      LEFT JOIN sr_order_sku_agg sr
        ON sr.order_id = sa.order_id
       AND sr.sku_norm = LOWER(TRIM(COALESCE(sa.sku,'')))
      LEFT JOIN settlement_report_qty_agg ps
        ON ps.order_id = sa.order_id
       AND ps.sku_norm = LOWER(TRIM(COALESCE(sa.sku,'')))
      LEFT JOIN shipped_sku_lookup shf
        ON shf.msku_norm = sa.sku_norm_key
      LEFT JOIN shipped_asin_lookup sha
        ON sa.sale_asin_norm IS NOT NULL
       AND sha.asin_norm = sa.sale_asin_norm
       AND shf.msku_norm IS NULL
      LEFT JOIN refund_order_sku_agg rf
        ON rf.order_id = sa.order_id
       AND rf.sku_norm = LOWER(TRIM(COALESCE(sa.sku,'')))
      LEFT JOIN order_settlement_ids osi
        ON osi.norm_oid = TRIM(REPLACE(REPLACE(COALESCE(sa.order_id::text, ''), CHR(160), ''), CHR(65279), ''))
    ),
    joined_with_profit AS (
      SELECT j.*,
        CASE
          WHEN (COALESCE(j.qty, 0)::bigint - COALESCE(j.refund_qty, 0)::bigint) = 0
          THEN (j.amount::numeric + COALESCE(j.refund_total, 0)::numeric)
          WHEN COALESCE(j.qty, 0)::numeric <> 0 AND j.shipped_per_book_usd IS NOT NULL
          THEN (j.amount::numeric / NULLIF(j.qty::numeric, 0)) - j.shipped_per_book_usd::numeric
          ELSE NULL
        END AS per_book_profit_usd
      FROM joined j
    )`;
}

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function decimalStr(v: unknown): string {
  if (v == null) return "0";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}

function strOr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s === "" ? null : s;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "bigint") return Number(v);
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseJsonbArray<T>(v: unknown): T[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as T[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function getSalesOrders(
  filters: SalesOrderFilters = {},
): Promise<SalesOrdersPayload> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * limit;
  const q = (filters.q ?? "").trim();
  const sortKey = (filters.sort ?? "sale_last").toLowerCase();
  const orderExpr = SORT_MAP[sortKey] ?? SORT_MAP.sale_last;
  const dir = filters.dir === "asc" ? "ASC" : "DESC";

  const cte = buildJoinedWithProfitCte();
  const searchClause = q
    ? ` WHERE sa.order_id ILIKE $1 OR sa.sku ILIKE $1
        OR COALESCE(sa.listing_title, '') ILIKE $1
        OR COALESCE(sa.publisher, '') ILIKE $1
        OR COALESCE(sa.delivery_location, '') ILIKE $1
        OR COALESCE(sa.asin, '') ILIKE $1
        OR COALESCE(sa.purchase_id::text, '') ILIKE $1`
    : "";

  const countSql = `${cte}
    SELECT COUNT(*)::int AS n FROM joined_with_profit sa
    ${searchClause}`;

  const totalsSql = `${cte}
    SELECT
      COALESCE(SUM(sa.qty), 0)::bigint AS sum_qty,
      COALESCE(SUM(COALESCE(sa.refund_qty, 0)), 0)::bigint AS sum_refund_qty,
      COALESCE(SUM(sa.amount), 0)::numeric(14,4) AS sum_amount,
      COALESCE(SUM(COALESCE(sa.refund_total, 0)), 0)::numeric(14,4) AS sum_refund_total,
      COALESCE(SUM(sa.qty - COALESCE(sa.refund_qty, 0)), 0)::bigint AS sum_final_qty,
      COALESCE(SUM(sa.amount + COALESCE(sa.refund_total, 0)), 0)::numeric(14,4) AS sum_final_amount,
      COALESCE(SUM(
        CASE
          WHEN (sa.qty::bigint - COALESCE(sa.refund_qty, 0)::bigint) = 0
          THEN (sa.amount + COALESCE(sa.refund_total, 0))::numeric
          WHEN sa.shipped_per_book_usd IS NOT NULL AND COALESCE(sa.qty, 0)::numeric <> 0
          THEN (
            (sa.amount::numeric / NULLIF(sa.qty::numeric, 0)) - sa.shipped_per_book_usd::numeric
          ) * (sa.qty::numeric - COALESCE(sa.refund_qty, 0)::numeric)
          ELSE 0::numeric
        END
      ), 0)::numeric(14,4) AS sum_book_profit_total,
      COALESCE(MAX(NULLIF(TRIM(sa.currency::text), '')), 'USD') AS sum_amount_currency
    FROM joined_with_profit sa
    ${searchClause}`;

  const dataSql = `${cte}
    SELECT
      order_id, sku, qty, currency, sales_rpt_gross,
      sale_first, sale_last, sale_span_days,
      settlement_qty_breakdown,
      st_qty, st_sales, st_fba_fees, st_fba_commission,
      st_variable_fee, st_other_charges, st_total,
      has_settlement_breakdown, amount,
      purchase_id, listing_title, asin, publisher, delivery_location,
      sh_stored_per_book_usd, sh_final_net_price_usd, sh_commission_usd,
      sh_supplier_shipping_usd, sh_warehouse_prep_usd,
      sh_inventory_place_inbound_usd, sh_expert_charges_usd, sh_other_charges_usd,
      shipped_per_book_usd, per_book_profit_usd,
      refund_qty, refund_total, refund_sales, refund_fba_fees,
      refund_fba_commission, refund_variable_fee, refund_other_charges,
      refund_qty_breakdown, has_refund_breakdown,
      order_settlement_ids, settlement_posted_min, settlement_posted_max
    FROM joined_with_profit sa
    ${searchClause}
    ORDER BY ${orderExpr} ${dir} NULLS LAST, sa.order_id ASC, sa.sku ASC
    LIMIT $${q ? 2 : 1} OFFSET $${q ? 3 : 2}`;

  const countParams = q ? [`%${q}%`] : [];
  const dataParams = q ? [`%${q}%`, limit, offset] : [limit, offset];

  const [cntRows, dataRows, totalsRows] = await Promise.all([
    prisma.$queryRawUnsafe<{ n: number }[]>(countSql, ...countParams),
    prisma.$queryRawUnsafe<Record<string, unknown>[]>(dataSql, ...dataParams),
    prisma.$queryRawUnsafe<Record<string, unknown>[]>(totalsSql, ...countParams),
  ]);

  const totals = totalsRows[0] ?? {};
  const total = Number(cntRows[0]?.n ?? 0);

  const rows: SalesOrderRow[] = dataRows.map((r) => {
    const qty = num(r.qty);
    const refundQty = num(r.refund_qty);
    const finalQty = qty - refundQty;
    const amount = num(r.amount);
    const refundTotal = num(r.refund_total);
    const finalAmount = amount + refundTotal;
    const hasShippedJoin = r.shipped_per_book_usd != null;
    const shippedCostBreakdown: ShippedCostBreakdown | null = hasShippedJoin
      ? {
          final_net_price_usd: numOrNull(r.sh_final_net_price_usd),
          commission_usd: numOrNull(r.sh_commission_usd),
          supplier_shipping_usd: numOrNull(r.sh_supplier_shipping_usd),
          warehouse_prep_usd: numOrNull(r.sh_warehouse_prep_usd),
          inventory_place_inbound_usd: numOrNull(
            r.sh_inventory_place_inbound_usd,
          ),
          expert_charges_usd: numOrNull(r.sh_expert_charges_usd),
          other_charges_usd: numOrNull(r.sh_other_charges_usd),
        }
      : null;

    return {
      order_id: String(r.order_id ?? ""),
      sku: String(r.sku ?? ""),
      qty,
      currency: String(r.currency ?? "USD"),
      sales_rpt_gross: decimalStr(r.sales_rpt_gross),
      sale_first: strOr(r.sale_first),
      sale_last: strOr(r.sale_last),
      sale_span_days: numOrNull(r.sale_span_days),
      settlement_qty_breakdown: parseJsonbArray<SettlementBreakdownEntry>(
        r.settlement_qty_breakdown,
      ),
      st_qty: numOrNull(r.st_qty),
      st_sales: r.st_sales != null ? decimalStr(r.st_sales) : null,
      st_fba_fees: r.st_fba_fees != null ? decimalStr(r.st_fba_fees) : null,
      st_fba_commission:
        r.st_fba_commission != null ? decimalStr(r.st_fba_commission) : null,
      st_variable_fee:
        r.st_variable_fee != null ? decimalStr(r.st_variable_fee) : null,
      st_other_charges:
        r.st_other_charges != null ? decimalStr(r.st_other_charges) : null,
      st_total: r.st_total != null ? decimalStr(r.st_total) : null,
      has_settlement_breakdown: r.has_settlement_breakdown === true,
      amount: decimalStr(r.amount),
      purchase_id: strOr(r.purchase_id),
      listing_title: strOr(r.listing_title),
      asin: strOr(r.asin),
      publisher: strOr(r.publisher),
      delivery_location: strOr(r.delivery_location),
      shipped_per_book_usd: numOrNull(r.shipped_per_book_usd),
      shipped_cost_breakdown: shippedCostBreakdown,
      has_shipped_cost_tooltip: hasShippedJoin,
      per_book_profit_usd: numOrNull(r.per_book_profit_usd),
      refund_qty: r.refund_qty != null ? num(r.refund_qty) : null,
      refund_total: r.refund_total != null ? decimalStr(r.refund_total) : null,
      refund_sales: r.refund_sales != null ? decimalStr(r.refund_sales) : null,
      refund_fba_fees:
        r.refund_fba_fees != null ? decimalStr(r.refund_fba_fees) : null,
      refund_fba_commission:
        r.refund_fba_commission != null
          ? decimalStr(r.refund_fba_commission)
          : null,
      refund_variable_fee:
        r.refund_variable_fee != null
          ? decimalStr(r.refund_variable_fee)
          : null,
      refund_other_charges:
        r.refund_other_charges != null
          ? decimalStr(r.refund_other_charges)
          : null,
      refund_qty_breakdown: parseJsonbArray<RefundBreakdownEntry>(
        r.refund_qty_breakdown,
      ),
      has_refund_breakdown: r.has_refund_breakdown === true,
      order_settlement_ids: parseJsonbArray<string>(r.order_settlement_ids),
      settlement_posted_min: strOr(r.settlement_posted_min),
      settlement_posted_max: strOr(r.settlement_posted_max),
      final_qty: finalQty,
      final_amount: finalAmount.toFixed(4),
    };
  });

  return {
    rows,
    total,
    limit,
    offset,
    sum_qty: num(totals.sum_qty),
    sum_refund_qty: num(totals.sum_refund_qty),
    sum_amount: num(totals.sum_amount),
    sum_refund_total: num(totals.sum_refund_total),
    sum_final_qty: num(totals.sum_final_qty),
    sum_final_amount: num(totals.sum_final_amount),
    sum_book_profit_total: num(totals.sum_book_profit_total),
    sum_amount_currency:
      typeof totals.sum_amount_currency === "string" &&
      totals.sum_amount_currency.trim()
        ? totals.sum_amount_currency.trim()
        : "USD",
  };
}
