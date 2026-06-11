import { ciEq, norm } from "./asin-matching";
import type { ReturnAggregate } from "./formula";
import type {
  AsinMatchStatus,
  AsinVerificationRow,
  AsinVerificationStats,
  CaseMeta,
  ReimbMeta,
  SalesOrderDetailMeta,
} from "./types";
import type { CatalogMeta } from "./legacy-types";

const EMPTY_REIMB: ReimbMeta = {
  qty: 0,
  qtyCash: 0,
  qtyInventory: 0,
  amount: 0,
  reimbType: "NONE",
};
const EMPTY_CASE: CaseMeta = {
  count: 0,
  claimedQty: 0,
  approvedQty: 0,
  approvedAmount: 0,
  caseIds: [],
  topStatus: "No Case",
  remarks: [],
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

export function computeAsinVerificationRow(input: {
  agg: ReturnAggregate;
  salesOrderMap: Map<string, SalesOrderDetailMeta>;
  catalogMap: Map<string, CatalogMeta>;
  reimbMap: Map<string, ReimbMeta>;
  caseMap: Map<string, CaseMeta>;
}): AsinVerificationRow {
  const { agg, salesOrderMap, catalogMap, reimbMap, caseMap } = input;

  const returnAsin = agg.asin;
  const returnMsku = agg.msku;
  const returnFnsku = agg.fnsku;
  const fnNorm = norm(returnFnsku);

  const salesEntry = salesOrderMap.get(agg.orderId);
  const catalogEntry = fnNorm ? catalogMap.get(fnNorm) : undefined;

  const salesAsinList = salesEntry ? Array.from(salesEntry.asinSet) : [];
  const salesMskuList = salesEntry ? Array.from(salesEntry.mskuSet) : [];
  const salesFnskuList = salesEntry ? Array.from(salesEntry.fnskuSet) : [];

  const returnAsinNorm = norm(returnAsin);
  const returnMskuNorm = norm(returnMsku);

  // ASIN check: matches if return ASIN is in the sales-order ASIN set OR catalog ASIN.
  const asinMatchSales =
    !!returnAsinNorm && salesEntry ? salesEntry.asinSet.has(returnAsinNorm) : false;
  const asinMatchCatalog = catalogEntry ? ciEq(returnAsin, catalogEntry.asin) : false;
  const asinMatch = asinMatchSales || asinMatchCatalog;

  // MSKU check: matches if return MSKU is in the sales-order MSKU set OR catalog MSKU.
  const mskuMatchSales =
    !!returnMskuNorm && salesEntry ? salesEntry.mskuSet.has(returnMskuNorm) : false;
  const mskuMatchCatalog = catalogEntry ? ciEq(returnMsku, catalogEntry.msku) : false;
  const mskuMatch = mskuMatchSales || mskuMatchCatalog;

  // FNSKU match (used for score only — existing tab does the FNSKU-status badge).
  const fnskuMatchSales =
    !!fnNorm && salesEntry ? salesEntry.fnskuSet.has(fnNorm) : false;
  const fnskuMatchCatalog = !!catalogEntry;
  const fnskuMatch = fnskuMatchSales || fnskuMatchCatalog;

  let matchStatus: AsinMatchStatus;
  if (!salesEntry && !catalogEntry) {
    matchStatus = "ORDER_NOT_FOUND";
  } else if (!catalogEntry && salesEntry && !fnskuMatchSales) {
    matchStatus = "NOT_IN_CATALOG";
  } else if (!returnAsinNorm || !returnMskuNorm) {
    // Treat missing return-side identifiers as "missing data" → NOT_IN_CATALOG.
    matchStatus = "NOT_IN_CATALOG";
  } else if (asinMatch && mskuMatch) {
    matchStatus = "FULLY_VERIFIED";
  } else if (!asinMatch && !mskuMatch) {
    matchStatus = "MULTI_MISMATCH";
  } else if (!asinMatch && mskuMatch) {
    matchStatus = "ASIN_MISMATCH";
  } else {
    matchStatus = "MSKU_MISMATCH";
  }

  const matchScore =
    (fnskuMatch ? 1 : 0) + (asinMatch ? 1 : 0) + (mskuMatch ? 1 : 0);

  const isSellable = Array.from(agg.dispositions).some((d) =>
    d.toUpperCase().includes("SELLABLE"),
  );
  const isSellableMismatch = isSellable && matchStatus !== "FULLY_VERIFIED";

  const reimb = reimbMap.get(agg.msku) ?? EMPTY_REIMB;
  const caseMeta = caseMap.get(agg.msku) ?? EMPTY_CASE;

  return {
    orderId: agg.orderId || "—",
    returnFnsku: returnFnsku || "—",
    returnAsin: returnAsin || "—",
    returnMsku: returnMsku || "—",
    returnTitle: agg.title || "—",
    returnedQty: agg.totalReturned,
    returnEvents: agg.returnEvents,
    disposition: Array.from(agg.dispositions).join(", "),
    reasons: Array.from(agg.reasons).join(", "),
    salesAsin: salesAsinList.join(", "),
    salesMsku: salesMskuList.join(", "),
    salesFnsku: salesFnskuList.join(", "),
    catalogAsin: catalogEntry ? catalogEntry.asin : "",
    catalogMsku: catalogEntry ? catalogEntry.msku : "",
    catalogTitle: catalogEntry ? catalogEntry.title : "",
    asinMatch,
    mskuMatch,
    matchStatus,
    matchScore,
    isSellable,
    isSellableMismatch,
    caseCount: caseMeta.count,
    caseStatusTop: caseMeta.topStatus,
    caseIds: caseMeta.caseIds.join(", "),
    reimbQty: reimb.qty,
    reimbAmount: reimb.amount,
    earliestReturn: fmtDate(agg.earliestReturn),
    latestReturn: fmtDate(agg.latestReturn),
  };
}

export function asinVerificationStats(
  rows: AsinVerificationRow[],
): AsinVerificationStats {
  const out: AsinVerificationStats = {
    total: 0,
    totalQty: 0,
    verifiedCount: 0,
    verifiedQty: 0,
    asinMismatchCount: 0,
    asinMismatchQty: 0,
    mskuMismatchCount: 0,
    mskuMismatchQty: 0,
    multiMismatchCount: 0,
    multiMismatchQty: 0,
    notInCatalogCount: 0,
    notInCatalogQty: 0,
    orderNotFoundCount: 0,
    orderNotFoundQty: 0,
    sellableMismatchCount: 0,
    sellableMismatchQty: 0,
  };
  for (const r of rows) {
    out.total++;
    out.totalQty += r.returnedQty;
    switch (r.matchStatus) {
      case "FULLY_VERIFIED":
        out.verifiedCount++;
        out.verifiedQty += r.returnedQty;
        break;
      case "ASIN_MISMATCH":
        out.asinMismatchCount++;
        out.asinMismatchQty += r.returnedQty;
        break;
      case "MSKU_MISMATCH":
        out.mskuMismatchCount++;
        out.mskuMismatchQty += r.returnedQty;
        break;
      case "MULTI_MISMATCH":
        out.multiMismatchCount++;
        out.multiMismatchQty += r.returnedQty;
        break;
      case "NOT_IN_CATALOG":
        out.notInCatalogCount++;
        out.notInCatalogQty += r.returnedQty;
        break;
      case "ORDER_NOT_FOUND":
        out.orderNotFoundCount++;
        out.orderNotFoundQty += r.returnedQty;
        break;
    }
    if (r.isSellableMismatch) {
      out.sellableMismatchCount++;
      out.sellableMismatchQty += r.returnedQty;
    }
  }
  return out;
}
