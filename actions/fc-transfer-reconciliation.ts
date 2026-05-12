"use server";

import { revalidatePath } from "next/cache";
import { AdjType, CaseStatus, Prisma, ReconType } from "@prisma/client";

import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import {
  aggregateFcAnalysis,
  aggregateFcSummary,
  fcStats,
} from "@/lib/fc-transfer-reconciliation/aggregate";
import {
  buildFcAdjMap,
  buildFcCaseMap,
} from "@/lib/fc-transfer-reconciliation/matching";
import type {
  FcAnalysisRow,
  FcLogRow,
  FcReconStats,
  FcSummaryRow,
} from "@/lib/fc-transfer-reconciliation/types";
import {
  fcAdjustmentSchema,
  fcRaiseCaseSchema,
} from "@/lib/validations/fc-transfer-reconciliation";

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type FcTransferReconPayload = {
  summary: FcSummaryRow[];
  analysis: FcAnalysisRow[];
  logRows: FcLogRow[];
  stats: FcReconStats;
};

export type FcTransferReconFilters = {
  from?: string | null;
  to?: string | null;
  fc?: string;
  search?: string;
};

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
  return AdjType.OTHER;
}

function revalidateAll() {
  revalidatePath("/fc-transfer-reconciliation");
  revalidatePath("/cases-adjustments");
}

export async function getFcTransferReconData(
  filters: FcTransferReconFilters = {},
): Promise<FcTransferReconPayload> {
  const where: Prisma.FcTransferWhereInput = { deletedAt: null };
  if (filters.from) {
    where.transferDate = { ...(where.transferDate as object | undefined), gte: new Date(filters.from) };
  }
  if (filters.to) {
    where.transferDate = {
      ...(where.transferDate as object | undefined),
      lte: new Date(filters.to + "T23:59:59"),
    };
  }
  if (filters.fc?.trim()) {
    where.fulfillmentCenter = { contains: filters.fc.trim(), mode: "insensitive" };
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { msku: { contains: q, mode: "insensitive" } },
      { fnsku: { contains: q, mode: "insensitive" } },
      { asin: { contains: q, mode: "insensitive" } },
    ];
  }

  const [transfers, cases, adjs] = await Promise.all([
    prisma.fcTransfer.findMany({
      where,
      select: {
        id: true,
        msku: true,
        fnsku: true,
        asin: true,
        title: true,
        quantity: true,
        transferDate: true,
        eventType: true,
        fulfillmentCenter: true,
        disposition: true,
        reason: true,
      },
      orderBy: { transferDate: "desc" },
    }),
    prisma.caseTracker.findMany({
      where: { deletedAt: null, reconType: ReconType.FC_TRANSFER },
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
      where: { deletedAt: null, reconType: ReconType.FC_TRANSFER },
      select: { msku: true, qtyAdjusted: true, reason: true },
    }),
  ]);

  const caseMap = buildFcCaseMap(cases);
  const adjMap = buildFcAdjMap(adjs);

  const summary = aggregateFcSummary(transfers, caseMap);
  const analysis = aggregateFcAnalysis(transfers, caseMap, adjMap);
  const stats = fcStats(summary, analysis);

  const logRows: FcLogRow[] = transfers.map((r) => ({
    id: r.id,
    transferDate: fmtIso(r.transferDate),
    msku: r.msku ?? "",
    fnsku: r.fnsku ?? "",
    asin: r.asin ?? "",
    title: r.title ?? "",
    quantity: r.quantity,
    eventType: r.eventType ?? "",
    fulfillmentCenter: r.fulfillmentCenter ?? "",
    disposition: r.disposition ?? "",
    reason: r.reason ?? "",
  }));

  return { summary, analysis, logRows, stats };
}

export async function saveFcCaseAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = fcRaiseCaseSchema.safeParse(raw);
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
        reconType: ReconType.FC_TRANSFER,
        orderId: "FC_TRANSFER",
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

export async function saveFcAdjustmentAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = fcAdjustmentSchema.safeParse(raw);
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
        reconType: ReconType.FC_TRANSFER,
        orderId: "FC_TRANSFER",
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
