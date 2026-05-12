"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getFullReconData } from "@/actions/full-reconciliation";
import type { FullReconRow, FullReconStatus } from "@/lib/full-reconciliation/types";

export type RefreshResult =
  | {
      ok: true;
      rowsUpserted: number;
      rowsMarkedRemoved: number;
      stats: {
        matched: number;
        pending: number;
        mismatch: number;
        totalVariance: number;
        totalSkus: number;
      };
      refreshedAt: Date;
    }
  | { ok: false; error: string };

const REVALIDATE_PATHS = [
  "/",
  "/full-reconciliation",
  "/reconciliation",
  "/cases-adjustments",
] as const;

function mapStatus(s: FullReconStatus): "matched" | "mismatch" | "pending" {
  switch (s) {
    case "Matched":
      return "matched";
    case "Over":
    case "Take Action":
    case "Reimbursed":
      return "mismatch";
    case "No Snapshot":
    default:
      return "pending";
  }
}

type ReconRow = {
  msku: string;
  fnsku: string | null;
  asin: string | null;
  title: string | null;
  store: string | null;
  shippedQty: number;
  receivedQty: number;
  soldQty: number;
  returnQty: number;
  reimbQty: number;
  removalQty: number;
  fcTransferQty: number;
  fbaEndingBalance: number;
  expectedQty: number;
  actualQty: number;
  variance: number;
  status: string;
  lastRefreshedAt: Date;
};

function toReconRow(r: FullReconRow, now: Date): ReconRow | null {
  const msku = (r.msku ?? "").trim();
  if (!msku) return null;
  const expected = r.endingBalance;
  const actual = r.fbaEndingBalance ?? 0;
  return {
    msku,
    fnsku: r.fnsku ? r.fnsku.trim() || null : null,
    asin: r.asin ? r.asin.trim() || null : null,
    title: r.title ? r.title.trim() || null : null,
    store: null,
    shippedQty: r.shippedQty,
    receivedQty: r.receiptQty,
    soldQty: r.soldQty,
    returnQty: r.returnQty,
    reimbQty: r.reimbQty,
    removalQty: r.removalRcptQty,
    fcTransferQty: r.fcNetQty,
    fbaEndingBalance: r.fbaEndingBalance ?? 0,
    expectedQty: expected,
    actualQty: actual,
    variance: expected - actual,
    status: mapStatus(r.reconStatus),
    lastRefreshedAt: now,
  };
}

/**
 * Recompute ReconciliationSummary from current fact tables.
 * Mirrors the full-reconciliation formula (single source of truth in
 * lib/full-reconciliation/formula.ts) and writes one row per (msku, store).
 */
export async function refreshReconciliationSummary(): Promise<RefreshResult> {
  const now = new Date();
  try {
    const payload = await getFullReconData({});
    const aggByKey = new Map<string, ReconRow>();
    for (const r of payload.rows) {
      const row = toReconRow(r, now);
      if (!row) continue;
      const key = `${row.msku}|${row.store ?? ""}`;
      const prev = aggByKey.get(key);
      if (!prev) {
        aggByKey.set(key, row);
        continue;
      }
      prev.shippedQty += row.shippedQty;
      prev.receivedQty += row.receivedQty;
      prev.soldQty += row.soldQty;
      prev.returnQty += row.returnQty;
      prev.reimbQty += row.reimbQty;
      prev.removalQty += row.removalQty;
      prev.fcTransferQty += row.fcTransferQty;
      prev.fbaEndingBalance += row.fbaEndingBalance;
      prev.expectedQty += row.expectedQty;
      prev.actualQty += row.actualQty;
      prev.variance = prev.expectedQty - prev.actualQty;
      if (!prev.fnsku && row.fnsku) prev.fnsku = row.fnsku;
      if (!prev.asin && row.asin) prev.asin = row.asin;
      if (!prev.title && row.title) prev.title = row.title;
      if (prev.status === "matched" && row.status !== "matched") {
        prev.status = row.status;
      }
    }

    let rowsUpserted = 0;
    let totalVariance = 0;
    let matched = 0;
    let mismatch = 0;
    let pending = 0;

    await prisma.$transaction(
      async (tx) => {
        for (const row of aggByKey.values()) {
          await tx.reconciliationSummary.upsert({
            where: { msku_store: { msku: row.msku, store: row.store ?? "" } },
            create: row,
            update: {
              fnsku: row.fnsku,
              asin: row.asin,
              title: row.title,
              shippedQty: row.shippedQty,
              receivedQty: row.receivedQty,
              soldQty: row.soldQty,
              returnQty: row.returnQty,
              reimbQty: row.reimbQty,
              removalQty: row.removalQty,
              fcTransferQty: row.fcTransferQty,
              fbaEndingBalance: row.fbaEndingBalance,
              expectedQty: row.expectedQty,
              actualQty: row.actualQty,
              variance: row.variance,
              status: row.status,
              lastRefreshedAt: row.lastRefreshedAt,
            },
          });
          rowsUpserted += 1;
          totalVariance += row.variance;
          if (row.status === "matched") matched += 1;
          else if (row.status === "mismatch") mismatch += 1;
          else pending += 1;
        }
      },
      { timeout: 60_000 },
    );

    const stale = await prisma.reconciliationSummary.updateMany({
      where: { lastRefreshedAt: { lt: now } },
      data: { status: "pending" },
    });

    for (const p of REVALIDATE_PATHS) {
      try {
        revalidatePath(p);
      } catch {
        // ignore
      }
    }

    return {
      ok: true,
      rowsUpserted,
      rowsMarkedRemoved: stale.count,
      stats: {
        matched,
        pending,
        mismatch,
        totalVariance,
        totalSkus: aggByKey.size,
      },
      refreshedAt: now,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Refresh failed.";
    return { ok: false, error: msg };
  }
}

