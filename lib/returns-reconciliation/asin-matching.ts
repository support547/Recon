import { trimStr } from "./matching";
import type { SalesOrderDetailMeta } from "./types";
import type { CatalogMeta } from "./legacy-types";

/** Normalize for case-insensitive comparison. */
export function norm(s: string | null | undefined): string {
  return trimStr(s).toLowerCase();
}

/** Equal under trim + case-insensitive. Empty strings never match. */
export function ciEq(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * Build per-order detail map keyed by orderId. Collects all fnsku/asin/msku
 * values seen on a single Amazon order across SalesData rows.
 */
export function buildSalesOrderDetailMap(
  rows: {
    orderId: string | null;
    fnsku: string | null;
    asin: string | null;
    msku: string | null;
  }[],
): Map<string, SalesOrderDetailMeta> {
  const map = new Map<string, SalesOrderDetailMeta>();
  for (const r of rows) {
    const oid = trimStr(r.orderId);
    if (!oid) continue;
    const prev =
      map.get(oid) ?? {
        fnskuSet: new Set<string>(),
        asinSet: new Set<string>(),
        mskuSet: new Set<string>(),
      };
    const fn = norm(r.fnsku);
    const as = norm(r.asin);
    const mk = norm(r.msku);
    if (fn) prev.fnskuSet.add(fn);
    if (as) prev.asinSet.add(as);
    if (mk) prev.mskuSet.add(mk);
    map.set(oid, prev);
  }
  return map;
}

/**
 * Build catalog map keyed by fnsku from ShippedToFba. When a fnsku appears
 * more than once, the latest row (by shipDate desc) wins.
 */
export function buildCatalogMap(
  rows: {
    fnsku: string | null;
    msku: string | null;
    asin: string | null;
    title: string | null;
    shipDate: Date | null;
  }[],
): Map<string, CatalogMeta> {
  const map = new Map<string, CatalogMeta>();
  // Track latest shipDate per fnsku to pick canonical row.
  const latestAt = new Map<string, number>();
  for (const r of rows) {
    const fk = norm(r.fnsku);
    if (!fk) continue;
    const ts = r.shipDate ? new Date(r.shipDate).getTime() : 0;
    const prevTs = latestAt.get(fk) ?? -Infinity;
    if (ts < prevTs) continue;
    latestAt.set(fk, ts);
    map.set(fk, {
      msku: trimStr(r.msku),
      asin: trimStr(r.asin),
      title: trimStr(r.title),
    });
  }
  return map;
}
