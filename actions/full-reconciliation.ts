"use server";

import { revalidatePath } from "next/cache";
import { AdjType, CaseStatus, Prisma, ReconType } from "@prisma/client";

import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import { summaryStats } from "@/lib/full-reconciliation/aggregate";
import {
  aggregateAdjByFnsku,
  aggregateByFnskuWithLatest,
  aggregateCasesByFnsku,
  aggregateFbaSummary,
  aggregateFcByFnsku,
  aggregateGnrByFnsku,
  aggregateRemovalReceipts,
  aggregateReimbursements,
  aggregateReplacementsByMsku,
  aggregateReturns,
  aggregateSalesNonZero,
  aggregateShipped,
  buildReimbsByMskuOrder,
  buildReturnsByMskuOrderFromRows,
  composeFullReconRow,
  trimStr,
} from "@/lib/full-reconciliation/formula";
import type { FullReconRow, FullReconStats } from "@/lib/full-reconciliation/types";
import {
  inventoryAdjustmentSchema,
  raiseInventoryCaseSchema,
} from "@/lib/validations/full-reconciliation";

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type FullReconciliationPayload = {
  rows: FullReconRow[];
  stats: FullReconStats;
};

function revalidateAll() {
  revalidatePath("/full-reconciliation");
  revalidatePath("/cases-adjustments");
}

function statusToEnum(s: string): CaseStatus {
  const v = s.toUpperCase();
  if (v === "RAISED" || v === "PENDING") return CaseStatus.IN_PROGRESS;
  if (v === "APPROVED") return CaseStatus.RESOLVED;
  if (v in CaseStatus) return v as CaseStatus;
  return CaseStatus.OPEN;
}

export type FullReconFilters = {
  search?: string;
};

export async function getFullReconData(
  filters: FullReconFilters = {},
): Promise<FullReconciliationPayload> {
  const search = filters.search?.trim();
  const searchPattern = search ? { contains: search, mode: "insensitive" as const } : undefined;

  // Search applies only to the anchor (ShippedToFba); auxiliary tables are joined post-hoc
  const shippedWhere: Prisma.ShippedToFbaWhereInput = { deletedAt: null };
  if (searchPattern) {
    shippedWhere.OR = [
      { msku: searchPattern },
      { fnsku: searchPattern },
      { asin: searchPattern },
      { title: searchPattern },
    ];
  }

  const [
    shippedRows,
    receiptRows,
    saleRows,
    returnRows,
    reimbRows,
    removalRcptRows,
    gnrRows,
    gnrManualRows,
    caseRows,
    adjRows,
    replacementRows,
    fcRows,
    fbaSummaryRows,
    shipStatusRows,
    receiptForLatestRows,
  ] = await Promise.all([
    prisma.shippedToFba.findMany({
      where: shippedWhere,
      select: {
        msku: true, title: true, asin: true, fnsku: true,
        shipDate: true, quantity: true, shipmentId: true,
      },
    }),
    prisma.fbaReceipt.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, quantity: true, receiptDate: true, shipmentId: true },
    }),
    prisma.salesData.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, quantity: true, saleDate: true, productAmount: true },
    }),
    prisma.customerReturn.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, msku: true, quantity: true, status: true,
        disposition: true, reason: true, orderId: true,
      },
    }),
    prisma.reimbursement.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, msku: true, quantity: true, amount: true,
        reason: true, amazonOrderId: true, caseId: true,
      },
    }),
    prisma.removalReceipt.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, orderId: true, receivedQty: true,
        sellableQty: true, unsellableQty: true,
        conditionReceived: true, status: true, receivedDate: true,
      },
    }),
    prisma.gnrReport.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, usedMsku: true, usedFnsku: true,
        usedCondition: true, quantity: true, unitStatus: true,
      },
    }),
    prisma.gradeResellItem.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, usedMsku: true, usedFnsku: true,
        usedCondition: true, quantity: true, unitStatus: true,
      },
    }),
    prisma.caseTracker.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, status: true, unitsApproved: true, amountApproved: true,
      },
    }),
    prisma.manualAdjustment.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, qtyAdjusted: true },
    }),
    prisma.replacement.findMany({
      where: { deletedAt: null },
      select: {
        msku: true, quantity: true,
        replacementOrderId: true, originalOrderId: true,
      },
    }),
    prisma.fcTransfer.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, quantity: true, transferDate: true },
    }),
    prisma.fbaSummary.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, disposition: true, endingBalance: true,
        vendorReturns: true, found: true, lost: true, damaged: true,
        disposedQty: true, otherEvents: true, unknownEvents: true,
        summaryDate: true,
      },
    }),
    prisma.shipmentStatus.findMany({
      where: { deletedAt: null },
      select: { shipmentId: true, status: true },
    }),
    prisma.fbaReceipt.findMany({
      where: { deletedAt: null, shipmentId: { not: null } },
      select: { shipmentId: true, receiptDate: true },
    }),
  ]);

  // Shipment status map
  const shipStatusMap = new Map<string, string>();
  for (const s of shipStatusRows) {
    const id = trimStr(s.shipmentId);
    if (id && s.status) shipStatusMap.set(id, s.status);
  }

  // Latest receipt date per shipment_id
  const shipLatestReceiptMap = new Map<string, Date>();
  for (const r of receiptForLatestRows) {
    const id = trimStr(r.shipmentId);
    if (!id || !r.receiptDate) continue;
    const prev = shipLatestReceiptMap.get(id);
    if (!prev || r.receiptDate > prev) shipLatestReceiptMap.set(id, r.receiptDate);
  }

  // Aggregates by FNSKU
  const shippedAgg = aggregateShipped(
    shippedRows.map((r) => ({ ...r, msku: r.msku ?? "" })),
    shipStatusMap,
    shipLatestReceiptMap,
  );
  const receiptsAgg = aggregateByFnskuWithLatest(
    receiptRows.map((r) => ({ fnsku: r.fnsku, quantity: r.quantity, date: r.receiptDate })),
  );
  const salesAgg = aggregateSalesNonZero(saleRows);
  const returnsAgg = aggregateReturns(returnRows);
  const reimbAgg = aggregateReimbursements(reimbRows);
  const removalRcptAgg = aggregateRemovalReceipts(removalRcptRows);
  const gnrAgg = aggregateGnrByFnsku([...gnrRows, ...gnrManualRows]);
  const casesAgg = aggregateCasesByFnsku(caseRows);
  const adjAgg = aggregateAdjByFnsku(adjRows);
  const fcAgg = aggregateFcByFnsku(fcRows);
  const fbaSummaryAgg = aggregateFbaSummary(fbaSummaryRows);

  // Replacement lookup maps
  const returnsByMskuOrder = buildReturnsByMskuOrderFromRows(
    returnRows.map((r) => ({ msku: r.msku, orderId: r.orderId, quantity: r.quantity })),
  );
  const reimbsByMskuOrder = buildReimbsByMskuOrder(
    reimbRows.map((r) => ({
      msku: r.msku, amazonOrderId: r.amazonOrderId, quantity: r.quantity, amount: r.amount,
    })),
  );
  const replAgg = aggregateReplacementsByMsku(
    replacementRows,
    returnsByMskuOrder,
    reimbsByMskuOrder,
  );

  // Compose rows
  const today = new Date();
  const rows: FullReconRow[] = [];
  for (const [fnsku, shipped] of shippedAgg) {
    const repl = shipped.msku ? replAgg.get(shipped.msku) : undefined;
    rows.push(
      composeFullReconRow({
        fnsku,
        shipped,
        receipts: receiptsAgg.get(fnsku),
        sales: salesAgg.get(fnsku),
        returns: returnsAgg.get(fnsku),
        reimb: reimbAgg.get(fnsku),
        removalRcpt: removalRcptAgg.get(fnsku),
        gnr: gnrAgg.get(fnsku),
        cases: casesAgg.get(fnsku),
        adj: adjAgg.get(fnsku),
        repl,
        fc: fcAgg.get(fnsku),
        fbaSummary: fbaSummaryAgg.get(fnsku),
        today,
      }),
    );
  }

  rows.sort((a, b) => a.msku.localeCompare(b.msku));

  const stats = summaryStats(rows);
  return { rows, stats };
}

export async function saveInventoryCaseAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = raiseInventoryCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const today = new Date();
    const row = await prisma.caseTracker.create({
      data: {
        msku: v.msku,
        fnsku: v.fnsku,
        asin: v.asin,
        title: v.title,
        reconType: ReconType.FBA_BALANCE,
        caseReason: v.caseType,
        unitsClaimed: v.unitsClaimed,
        unitsApproved: 0,
        amountClaimed: new Prisma.Decimal(v.amountClaimed),
        amountApproved: new Prisma.Decimal(0),
        currency: "USD",
        status: statusToEnum("OPEN"),
        issueDate: today,
        raisedDate: today,
        notes: v.notes,
      },
    });
    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function saveInventoryAdjustmentAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = inventoryAdjustmentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const row = await prisma.manualAdjustment.create({
      data: {
        msku: v.msku,
        fnsku: v.fnsku,
        asin: v.asin,
        title: v.title,
        reconType: ReconType.FBA_BALANCE,
        adjType: AdjType.QUANTITY,
        qtyBefore: 0,
        qtyAdjusted: v.qtyAdjusted,
        qtyAfter: v.qtyAdjusted,
        reason: v.reason,
        notes: v.notes,
      },
    });
    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function getFullReconRemarks(): Promise<Record<string, string>> {
  const rows = await prisma.fullReconRemark.findMany({
    select: { fnsku: true, remarks: true },
  });
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.fnsku && r.remarks) map[r.fnsku] = r.remarks;
  }
  return map;
}

export async function saveFullReconRemark(
  fnsku: string,
  remarks: string | null,
): Promise<MutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unauthorized.",
    };
  }
  const key = (fnsku ?? "").trim();
  if (!key) return { ok: false, error: "fnsku required" };
  const value = remarks != null ? String(remarks).trim() || null : null;
  try {
    await prisma.fullReconRemark.upsert({
      where: { fnsku: key },
      create: { fnsku: key, remarks: value },
      update: { remarks: value },
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}
