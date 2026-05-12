/**
 * Settlement Report SQL helpers — ported from `FBA Inventory/server.js` lines 2044-2105.
 *
 * These produce raw SQL fragments that match the legacy semantics exactly so
 * Settlement Report and Sales Recon stay byte-identical with the HTML ERP.
 *
 * All fragments are designed to be embedded as substring concatenations into
 * `prisma.$queryRawUnsafe` queries. They contain ONLY hard-coded SQL — no user
 * input — so they are safe to interpolate.
 */

export type SettlementTab = "orders" | "refunds" | "other";

export function normalizeSettlementTab(tab: string | null | undefined): SettlementTab {
  const s = String(tab ?? "orders").trim().toLowerCase();
  if (s === "refund" || s === "refunds") return "refunds";
  if (s === "order" || s === "orders") return "orders";
  if (s === "other") return "other";
  return "orders";
}

export function settlementTabFilter(tab: SettlementTab): string {
  if (tab === "orders") return "LOWER(COALESCE(transaction_type,'')) LIKE '%order%'";
  if (tab === "refunds") return "LOWER(COALESCE(transaction_type,'')) LIKE '%refund%'";
  return "LOWER(COALESCE(transaction_type,'')) NOT LIKE '%order%' AND LOWER(COALESCE(transaction_type,'')) NOT LIKE '%refund%'";
}

/** Amazon US: VariableClosingFee is $1.80 per unit — used to derive refund line qty when quantity is blank. */
export const SETTLEMENT_VARIABLE_FEE_PER_UNIT = 1.8;

/** Best posted date per line (file column posted-date, else date part of posted-date-time). */
export const SETTLEMENT_EFFECTIVE_POSTED_MAX = `MAX(
  CASE
    WHEN TRIM(COALESCE(posted_date::text, '')) <> '' THEN TRIM(posted_date::text)
    WHEN TRIM(COALESCE(posted_date_time::text, '')) <> '' THEN TRIM(SPLIT_PART(REGEXP_REPLACE(TRIM(posted_date_time::text), 'T', ' '), ' ', 1))
    ELSE NULL
  END
)`;

/** Other-tab row qty: quantity-purchased; if 0, derive from VariableClosingFee or Grade & Resell ($1.80/unit). */
export function settlementOtherLineQtyExpr(): string {
  const clean =
    "REPLACE(REPLACE(TRIM(COALESCE(amount_description, '')), CHR(160), ''), CHR(65279), '')";
  const desc = `LOWER(REGEXP_REPLACE(${clean}, '[[:space:]]+', '', 'g'))`;
  return `(CASE
    WHEN COALESCE(quantity_purchased, 0) <> 0 THEN quantity_purchased::int
    WHEN ${desc} LIKE '%variableclosingfee%'
      THEN GREATEST(0, ROUND(ABS(COALESCE(amount, 0)::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric))::int
    WHEN LOWER(COALESCE(amount_type, '')) LIKE '%grade%resell%'
      THEN GREATEST(0, ROUND(ABS(COALESCE(amount, 0)::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric))::int
    ELSE 0
  END)`;
}

export type SettlementAmountPivot = {
  sales: string;
  fbaFees: string;
  commission: string;
  variableFee: string;
  other: string;
  total: string;
};

/** Normalized amount_description → sales / FBA fees / commission / variable closing / other. */
export function settlementAmountPivotExpr(
  colRef = "amount_description",
  amtRef = "amount",
): SettlementAmountPivot {
  const clean = `REPLACE(REPLACE(TRIM(COALESCE(${colRef}, '')), CHR(160), ''), CHR(65279), '')`;
  const desc = `LOWER(REGEXP_REPLACE(${clean}, '[[:space:]]+', '', 'g'))`;
  const amt = `COALESCE(${amtRef}, 0)`;
  return {
    sales: `SUM(CASE WHEN ${desc} = 'principal' THEN ${amt} ELSE 0 END)`,
    fbaFees: `SUM(CASE WHEN ${desc} LIKE '%fbaperunitfulfillmentfee%' THEN ${amt} ELSE 0 END)`,
    commission: `SUM(CASE WHEN ${desc} = 'commission' THEN ${amt} ELSE 0 END)`,
    variableFee: `SUM(CASE WHEN ${desc} LIKE '%variableclosingfee%' THEN ${amt} ELSE 0 END)`,
    other: `SUM(CASE
      WHEN ${desc} = 'principal' THEN 0
      WHEN ${desc} LIKE '%fbaperunitfulfillmentfee%' THEN 0
      WHEN ${desc} = 'commission' THEN 0
      WHEN ${desc} LIKE '%variableclosingfee%' THEN 0
      ELSE ${amt}
    END)`,
    total: `SUM(${amt})`,
  };
}
