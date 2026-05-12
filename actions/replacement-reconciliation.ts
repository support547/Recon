"use server";

import { revalidatePath } from "next/cache";
import { AdjType, CaseStatus, Prisma, ReconType } from "@prisma/client";

import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import { summaryStats } from "@/lib/replacement-reconciliation/aggregate";
import { computeReplacementRow } from "@/lib/replacement-reconciliation/formula";
import {
  buildAdjMap,
  buildCaseMap,
  buildReplaceReimbsByMskuOrder,
  buildReturnsByMskuOrder,
} from "@/lib/replacement-reconciliation/matching";
import type {
  ReplacementLogRow,
  ReplacementReconRow,
  ReplacementReconStats,
} from "@/lib/replacement-reconciliation/types";
import {
  raiseReplaceCaseSchema,
  replaceAdjustmentSchema,
} from "@/lib/validations/replacement-reconciliation";

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type ReplacementReconciliationPayload = {
  rows: ReplacementReconRow[];
  logRows: ReplacementLogRow[];
  stats: ReplacementReconStats;
};

function revalidateAll() {
  revalidatePath("/replacement-reconciliation");
  revalidatePath("/cases-adjustments");
}

function fmtIso(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function statusToEnum(s: string): CaseStatus {
  const v = s.toUpperCase();
  if (v in CaseStatus) return v as CaseStatus;
  return CaseStatus.OPEN;
}

function adjTypeToEnum(s: string): AdjType {
  const v = s.toUpperCase();
  if (v === "QUANTITY" || v === "RECOUNT") return AdjType.QUANTITY;
  if (v === "FINANCIAL" || v === "CREDIT") return AdjType.FINANCIAL;
  if (v === "STATUS" || v === "TRANSFER") return AdjType.STATUS;
  if (v === "OTHER" || v === "WRITE-OFF" || v === "WRITE_OFF") return AdjType.OTHER;
  return AdjType.OTHER;
}

export type ReplacementReconFilters = {
  from?: string | null;
  to?: string | null;
  status?: string;
  search?: string;
};

export async function getReplacementReconData(
  filters: ReplacementReconFilters = {},
): Promise<ReplacementReconciliationPayload> {
  const where: Prisma.ReplacementWhereInput = { deletedAt: null };
  if (filters.from) {
    where.shipmentDate = { ...(where.shipmentDate as object | undefined), gte: new Date(filters.from) };
  }
  if (filters.to) {
    where.shipmentDate = { ...(where.shipmentDate as object | undefined), lte: new Date(filters.to + "T23:59:59") };
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { msku: { contains: q, mode: "insensitive" } },
      { asin: { contains: q, mode: "insensitive" } },
      { replacementOrderId: { contains: q, mode: "insensitive" } },
      { originalOrderId: { contains: q, mode: "insensitive" } },
    ];
  }

  const [replacements, returns, reimbs, cases, adjs] = await Promise.all([
    prisma.replacement.findMany({
      where,
      orderBy: { shipmentDate: "desc" },
      select: {
        id: true,
        shipmentDate: true,
        msku: true,
        asin: true,
        quantity: true,
        replacementReasonCode: true,
        replacementOrderId: true,
        originalOrderId: true,
        fulfillmentCenterId: true,
        originalFulfillmentCenterId: true,
      },
    }),
    prisma.customerReturn.findMany({
      where: { deletedAt: null },
      select: {
        msku: true,
        orderId: true,
        quantity: true,
        disposition: true,
        reason: true,
        returnDate: true,
      },
    }),
    prisma.reimbursement.findMany({
      where: { deletedAt: null },
      select: {
        msku: true,
        amazonOrderId: true,
        reason: true,
        quantity: true,
        amount: true,
        reimbursementId: true,
        approvalDate: true,
      },
    }),
    prisma.caseTracker.findMany({
      where: { deletedAt: null, reconType: ReconType.REPLACEMENT },
      select: {
        msku: true,
        orderId: true,
        unitsApproved: true,
        amountApproved: true,
        status: true,
        referenceId: true,
      },
    }),
    prisma.manualAdjustment.findMany({
      where: { deletedAt: null, reconType: ReconType.REPLACEMENT },
      select: { msku: true, orderId: true, qtyAdjusted: true },
    }),
  ]);

  const returnsMap = buildReturnsByMskuOrder(returns);
  const reimbsMap = buildReplaceReimbsByMskuOrder(reimbs);
  const caseMap = buildCaseMap(cases);
  const adjMap = buildAdjMap(adjs);

  let rows: ReplacementReconRow[] = replacements.map((r) =>
    computeReplacementRow({ replacement: r, returnsMap, reimbsMap, caseMap, adjMap }),
  );

  if (filters.status && filters.status !== "all" && filters.status !== "") {
    rows = rows.filter((r) => r.status === filters.status);
  }

  const stats = summaryStats(rows);

  const logRows: ReplacementLogRow[] = replacements.map((r) => ({
    id: r.id,
    shipmentDate: fmtIso(r.shipmentDate),
    msku: r.msku ?? "",
    asin: r.asin ?? "",
    quantity: r.quantity,
    fulfillmentCenterId: r.fulfillmentCenterId ?? "",
    originalFulfillmentCenterId: r.originalFulfillmentCenterId ?? "",
    replacementReasonCode: r.replacementReasonCode ?? "",
    replacementOrderId: r.replacementOrderId ?? "",
    originalOrderId: r.originalOrderId ?? "",
  }));

  return { rows, logRows, stats };
}

export async function saveReplaceCaseAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = raiseReplaceCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const today = new Date();
    const row = await prisma.caseTracker.create({
      data: {
        msku: v.msku,
        asin: v.asin,
        reconType: ReconType.REPLACEMENT,
        orderId: v.orderId,
        referenceId: v.caseId,
        caseReason: v.caseReason,
        unitsClaimed: v.unitsClaimed,
        unitsApproved: 0,
        amountClaimed: new Prisma.Decimal(v.amountClaimed),
        amountApproved: new Prisma.Decimal(0),
        currency: "USD",
        status: statusToEnum(v.status),
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

export async function saveReplaceAdjustmentAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = replaceAdjustmentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const row = await prisma.manualAdjustment.create({
      data: {
        msku: v.msku,
        asin: v.asin,
        reconType: ReconType.REPLACEMENT,
        orderId: v.orderId,
        adjType: adjTypeToEnum(v.adjType),
        qtyBefore: 0,
        qtyAdjusted: v.qtyAdjusted,
        qtyAfter: v.qtyAdjusted,
        reason: v.reason,
        adjDate: v.adjDate ? new Date(v.adjDate) : null,
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
