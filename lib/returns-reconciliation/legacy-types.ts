// ── Legacy types ───────────────────────────────────────────────────────────
// Kept out of the rewritten status model (types.ts) but still consumed by the
// Returns Log tab, ASIN verification matching, and the FNSKU status badge.

// Log row (Returns Log tab + actions)
export type ReturnsLogRow = {
  id: string;
  returnDate: string;
  msku: string;
  fnsku: string;
  orderId: string;
  title: string;
  quantity: number;
  disposition: string;
  detailedDisposition: string;
  reason: string;
  status: string;
  fulfillmentCenter: string;
  licensePlateNumber: string;
  caseId: string;
};

// Catalog metadata (ASIN matching/formula)
export type CatalogMeta = {
  msku: string;
  asin: string;
  title: string;
};

// FNSKU status badge keys
export type FnskuStatusKey =
  | "MATCHED_FNSKU"
  | "FNSKU_MISMATCH"
  | "GNR_TRANSFERRED"
  | "WRONG_SELLER"
  | "UNRELATED_ITEM"
  | "ORDER_NOT_FOUND";

// Sales-fnsku metadata (backward-compat imports)
export type SalesFnskuMeta = {
  orderExists: boolean;
  fnskuSet: Set<string>;
  msku: string;
  asin: string;
};
