"use server";

import { revalidatePath } from "next/cache";
import { AdjType, CaseStatus, Prisma, ReconType } from "@prisma/client";

import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import {
  adjStats,
  aggregateAdjAnalysis,
  aggregateAdjPivot,
  buildAdjLogRows,
} from "@/lib/adjustment-reconciliation/aggregate";
import {
  buildAdjAdjMap,
  buildAdjCaseMap,
  buildAdjCaseMapByAsin,
  buildAdjReimbMap,
  buildAdjReimbMapFromManualByAsin,
} from "@/lib/adjustment-reconciliation/matching";
import type {
  AdjAnalysisRow,
  AdjLogRow,
  AdjPivotGroupBy,
  AdjPivotResult,
  AdjReconStats,
} from "@/lib/adjustment-reconciliation/types";
import {
  adjManualAdjSchema,
  adjRaiseCaseSchema,
} from "@/lib/validations/adjustment-reconciliation";

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type AdjReconPayload = {
  analysis: AdjAnalysisRow[];
  pivot: AdjPivotResult;
  logRows: AdjLogRow[];
  stats: AdjReconStats;
};

export type AdjReconFilters = {
  from?: string | null;
  to?: string | null;
  store?: string;
  search?: string;
  groupBy?: AdjPivotGroupBy;
};

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
  return AdjType.OTHER;
}

function revalidateAll() {
  revalidatePath("/adjustment-reconciliation");
  revalidatePath("/cases-adjustments");
}

const REIMB_REASONS_DAMAGED_LOST = [
  "damaged_warehouse",
  "lost_warehouse",
  "damaged warehouse",
  "lost warehouse",
];

export async function getAdjReconData(
  filters: AdjReconFilters = {},
): Promise<AdjReconPayload> {
  const where: Prisma.InventoryAdjustmentWhereInput = { deletedAt: null };
  if (filters.from) {
    where.adjDate = { ...(where.adjDate as object | undefined), gte: new Date(filters.from) };
  }
  if (filters.to) {
    where.adjDate = {
      ...(where.adjDate as object | undefined),
      lte: new Date(filters.to + "T23:59:59"),
    };
  }
  if (filters.store?.trim()) {
    where.store = filters.store.trim();
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { msku: { contains: q, mode: "insensitive" } },
      { fnsku: { contains: q, mode: "insensitive" } },
      { asin: { contains: q, mode: "insensitive" } },
      { referenceId: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
    ];
  }

  const [adjs, cases, manualAdjs, reimbs] = await Promise.all([
    prisma.inventoryAdjustment.findMany({
      where,
      select: {
        id: true,
        adjDate: true,
        fnsku: true,
        msku: true,
        asin: true,
        title: true,
        quantity: true,
        reason: true,
        disposition: true,
        fulfillmentCenter: true,
        reconciledQty: true,
        unreconciledQty: true,
        referenceId: true,
        store: true,
      },
      orderBy: { adjDate: "desc" },
    }),
    prisma.caseTracker.findMany({
      where: { deletedAt: null, reconType: ReconType.ADJUSTMENT },
      select: {
        msku: true,
        asin: true,
        unitsClaimed: true,
        unitsApproved: true,
        amountApproved: true,
        status: true,
        referenceId: true,
      },
    }),
    prisma.manualAdjustment.findMany({
      where: { deletedAt: null, reconType: ReconType.ADJUSTMENT },
      select: {
        msku: true,
        asin: true,
        qtyAdjusted: true,
        amount: true,
        reason: true,
        referenceId: true,
      },
    }),
    prisma.reimbursement.findMany({
      where: {
        deletedAt: null,
        reason: { in: REIMB_REASONS_DAMAGED_LOST, mode: "insensitive" },
      },
      select: {
        msku: true,
        asin: true,
        quantity: true,
        amount: true,
        reason: true,
      },
    }),
  ]);

  const caseMap = buildAdjCaseMap(cases);
  const adjMap = buildAdjAdjMap(manualAdjs);
  const reimbMap = buildAdjReimbMap(reimbs);
  const caseMapByAsin = buildAdjCaseMapByAsin(cases);
  const reimbMapByAsin = buildAdjReimbMapFromManualByAsin(manualAdjs);

  const analysis = aggregateAdjAnalysis(adjs, caseMap, adjMap, reimbMap);
  const groupBy = filters.groupBy ?? "asin";
  const pivot = aggregateAdjPivot(
    adjs,
    groupBy,
    groupBy === "asin" ? caseMapByAsin : caseMap,
    groupBy === "asin" ? reimbMapByAsin : reimbMap,
  );
  const logRows = buildAdjLogRows(adjs);
  const stats = adjStats(analysis);

  return { analysis, pivot, logRows, stats };
}

export async function getAdjStores(): Promise<string[]> {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: { deletedAt: null, store: { not: null } },
    distinct: ["store"],
    select: { store: true },
    orderBy: { store: "asc" },
  });
  return rows
    .map((r) => r.store?.trim() ?? "")
    .filter((s) => s.length > 0);
}

export async function saveAdjCaseAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = adjRaiseCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const today = new Date();
    const row = await prisma.caseTracker.create({
      data: {
        msku: v.msku ?? null,
        fnsku: v.fnsku,
        asin: v.asin,
        title: v.title,
        reconType: ReconType.ADJUSTMENT,
        orderId: null,
        referenceId: v.caseId,
        caseUrl: v.caseUrl,
        caseReason: v.claimType,
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

export async function saveAdjManualAdjAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = adjManualAdjSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const row = await prisma.manualAdjustment.create({
      data: {
        msku: v.msku ?? null,
        fnsku: v.fnsku,
        asin: v.asin,
        title: v.title,
        reconType: ReconType.ADJUSTMENT,
        orderId: null,
        referenceId: v.referenceId ?? null,
        adjType: adjTypeToEnum(v.adjType),
        qtyBefore: 0,
        qtyAdjusted: v.qtyAdjusted,
        qtyAfter: v.qtyAdjusted,
        amount:
          v.amount != null ? new Prisma.Decimal(v.amount) : null,
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
