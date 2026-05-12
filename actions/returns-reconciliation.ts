"use server";

import { revalidatePath } from "next/cache";
import { AdjType, CaseStatus, Prisma, ReconType } from "@prisma/client";

import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import { summaryStats } from "@/lib/returns-reconciliation/aggregate";
import { aggregateReturns, computeReturnRow } from "@/lib/returns-reconciliation/formula";
import {
  buildAdjMap,
  buildCaseMap,
  buildReimbMap,
  buildSalesFnskuMap,
} from "@/lib/returns-reconciliation/matching";
import type {
  ReturnsLogRow,
  ReturnsReconRow,
  ReturnsReconStats,
} from "@/lib/returns-reconciliation/types";
import {
  adjustmentSchema,
  raiseCaseSchema,
} from "@/lib/validations/returns-reconciliation";

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type ReturnsReconciliationPayload = {
  rows: ReturnsReconRow[];
  logRows: ReturnsLogRow[];
  stats: ReturnsReconStats;
};

function revalidateAll() {
  revalidatePath("/returns-reconciliation");
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

export type ReturnsReconFilters = {
  from?: string | null;
  to?: string | null;
  disposition?: string;
  fnskuStatus?: string;
  search?: string;
};

export async function getReturnsReconData(
  filters: ReturnsReconFilters = {},
): Promise<ReturnsReconciliationPayload> {
  const where: Prisma.CustomerReturnWhereInput = { deletedAt: null };
  if (filters.from) {
    where.returnDate = { ...(where.returnDate as object | undefined), gte: new Date(filters.from) };
  }
  if (filters.to) {
    where.returnDate = { ...(where.returnDate as object | undefined), lte: new Date(filters.to + "T23:59:59") };
  }
  if (filters.disposition && filters.disposition !== "all" && filters.disposition !== "") {
    where.disposition = { contains: filters.disposition, mode: "insensitive" };
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { msku: { contains: q, mode: "insensitive" } },
      { fnsku: { contains: q, mode: "insensitive" } },
      { asin: { contains: q, mode: "insensitive" } },
      { orderId: { contains: q, mode: "insensitive" } },
    ];
  }

  const [returns, sales, reimbs, cases, adjs] = await Promise.all([
    prisma.customerReturn.findMany({
      where,
      select: {
        id: true,
        orderId: true,
        fnsku: true,
        msku: true,
        asin: true,
        title: true,
        quantity: true,
        disposition: true,
        detailedDisposition: true,
        reason: true,
        returnDate: true,
        status: true,
        fulfillmentCenter: true,
        licensePlateNumber: true,
      },
    }),
    prisma.salesData.findMany({
      where: { deletedAt: null },
      select: { orderId: true, fnsku: true, msku: true },
    }),
    prisma.reimbursement.findMany({
      where: { deletedAt: null },
      select: { msku: true, reason: true, quantity: true, amount: true },
    }),
    prisma.caseTracker.findMany({
      where: { deletedAt: null, reconType: ReconType.RETURN },
      select: {
        msku: true,
        unitsClaimed: true,
        unitsApproved: true,
        amountApproved: true,
        status: true,
        referenceId: true,
      },
    }),
    prisma.manualAdjustment.findMany({
      where: { deletedAt: null, reconType: ReconType.RETURN },
      select: { orderId: true, fnsku: true, qtyAdjusted: true, reason: true },
    }),
  ]);

  const salesMap = buildSalesFnskuMap(sales);
  const reimbMap = buildReimbMap(reimbs);
  const caseMap = buildCaseMap(cases);
  const adjMap = buildAdjMap(adjs);

  const aggs = aggregateReturns(returns);
  let rows = aggs.map((agg) => computeReturnRow({ agg, salesMap, reimbMap, caseMap, adjMap }));

  if (filters.fnskuStatus && filters.fnskuStatus !== "all" && filters.fnskuStatus !== "") {
    rows = rows.filter((r) => r.fnskuStatus === filters.fnskuStatus);
  }

  const stats = summaryStats(rows);

  const logRows: ReturnsLogRow[] = returns.map((r) => ({
    id: r.id,
    returnDate: fmtIso(r.returnDate),
    msku: r.msku ?? "",
    fnsku: r.fnsku ?? "",
    orderId: r.orderId ?? "",
    title: r.title ?? "",
    quantity: r.quantity,
    disposition: r.disposition ?? "",
    detailedDisposition: r.detailedDisposition ?? "",
    reason: r.reason ?? "",
    status: r.status ?? "",
    fulfillmentCenter: r.fulfillmentCenter ?? "",
    licensePlateNumber: r.licensePlateNumber ?? "",
    caseId: "",
  }));

  return { rows, logRows, stats };
}

export async function saveReturnCaseAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = raiseCaseSchema.safeParse(raw);
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
        reconType: ReconType.RETURN,
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

export async function saveReturnAdjustmentAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = adjustmentSchema.safeParse(raw);
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
        reconType: ReconType.RETURN,
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
