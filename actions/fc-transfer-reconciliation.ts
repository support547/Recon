"use server";

import { revalidatePath } from "next/cache";
import { AdjType, CaseStatus, Prisma, ReconType } from "@prisma/client";

import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import {
  buildFcAdjMap,
  buildFcCaseMap,
} from "@/lib/fc-transfer-reconciliation/matching";
import {
  aggregateFcFullRecon,
  fcFullStats,
} from "@/lib/fc-transfer-reconciliation/full-recon";
import {
  aggregateFcByFc,
  fcByFcDetails,
  fcByFcStats,
} from "@/lib/fc-transfer-reconciliation/by-fc";
import type { FcLogRow } from "@/lib/fc-transfer-reconciliation/types";
import type {
  FcFullReconRow,
  FcFullStats,
} from "@/lib/fc-transfer-reconciliation/full-recon-types";
import type {
  FcByFcDetail,
  FcByFcRow,
  FcByFcStats,
} from "@/lib/fc-transfer-reconciliation/by-fc-types";
import {
  fcAdjustmentSchema,
  fcRaiseCaseSchema,
} from "@/lib/validations/fc-transfer-reconciliation";

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

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

export type FcFullReconPayload = {
  rows: FcFullReconRow[];
  stats: FcFullStats;
  // Raw transfer ledger for the Transfer Log tab (+ MSKU log drill-down). Built
  // from the same `transfers` query, so the Log tab no longer needs the legacy
  // engine and the Full tab's rows/stats are unaffected.
  logRows: FcLogRow[];
};

/**
 * Data feed for the FC Transfer page: the Full Reconciliation tab (rows + stats
 * with embedded leg-detail groups) AND the Transfer Log tab (logRows). Single
 * deletedAt:null query, same filter shape.
 */
export async function getFcTransferFullRecon(
  filters: FcTransferReconFilters = {},
): Promise<FcFullReconPayload> {
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
        referenceId: true,
      },
      orderBy: { transferDate: "desc" },
    }),
    prisma.caseTracker.findMany({
      where: { deletedAt: null, reconType: ReconType.FC_TRANSFER },
      select: {
        msku: true,
        fnsku: true,
        asin: true,
        unitsClaimed: true,
        unitsApproved: true,
        amountApproved: true,
        status: true,
        referenceId: true,
        raisedDate: true,
        issueDate: true,
      },
    }),
    prisma.manualAdjustment.findMany({
      where: { deletedAt: null, reconType: ReconType.FC_TRANSFER },
      select: { msku: true, fnsku: true, asin: true, qtyAdjusted: true, reason: true, adjDate: true },
    }),
  ]);

  const caseMap = buildFcCaseMap(cases);
  const adjMap = buildFcAdjMap(adjs);

  const rows = aggregateFcFullRecon(transfers, caseMap, adjMap);
  const stats = fcFullStats(rows);

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

  return { rows, stats, logRows };
}

export type FcByFcPayload = {
  rows: FcByFcRow[];
  stats: FcByFcStats;
  // Per-FC drill-down detail keyed by FC code: the MSKUs at each FC (with their
  // in/out/net AT THAT FC) and the underlying legs. Serialized as an array of
  // [fc, detail] entries (Maps don't survive the server→client boundary).
  details: Array<[string, FcByFcDetail]>;
};

/**
 * Data feed for the "By FC" view — an FC-WISE ANALYSIS SUMMARY (descriptive
 * only; no status/coverage/episodes). Fetches the SAME fcTransfer rows as
 * getFcTransferFullRecon (deletedAt:null + the From/To/FC/search filters), then
 * runs the analysis aggregation. Does NOT touch the full-recon engine or its
 * cases/adjustments overlay — pure transfer-ledger flow per node.
 */
export async function getFcByFcSummary(
  filters: FcTransferReconFilters = {},
): Promise<FcByFcPayload> {
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

  const transfers = await prisma.fcTransfer.findMany({
    where,
    select: {
      id: true,
      msku: true,
      fnsku: true,
      asin: true,
      title: true,
      quantity: true,
      transferDate: true,
      fulfillmentCenter: true,
      disposition: true,
    },
    orderBy: { transferDate: "desc" },
  });

  const rows = aggregateFcByFc(transfers);
  const stats = fcByFcStats(transfers);
  const details = Array.from(fcByFcDetails(transfers).entries());

  return { rows, stats, details };
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
        orderId: null,
        referenceId: v.caseId,
        caseUrl: v.caseUrl,
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
        orderId: null,
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
