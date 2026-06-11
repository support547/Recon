"use server";

import { revalidatePath } from "next/cache";
import { AdjType, CaseStatus, Prisma, ReconType } from "@prisma/client";

import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import type { GnrLogRow } from "@/lib/gnr-reconciliation/types";
import {
  gnrAdjustmentSchema,
  raiseGnrCaseSchema,
} from "@/lib/validations/gnr-reconciliation";

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/gnr-reconciliation");
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
  // v2 used: raised/pending → IN_PROGRESS; approved/resolved → RESOLVED; rejected → REJECTED
  if (v === "RAISED" || v === "PENDING") return CaseStatus.IN_PROGRESS;
  if (v === "APPROVED") return CaseStatus.RESOLVED;
  if (v in CaseStatus) return v as CaseStatus;
  return CaseStatus.OPEN;
}

/**
 * Slim GNR Log payload — the Log tab only needs gnr_report rows merged with the
 * manual grade_resell_items entries (same shape/sort as the old getGnrReconData
 * log section, sans the heavy reconciliation joins).
 */
export async function getGnrLogData(
  filters: { search?: string } = {},
): Promise<{ logRows: GnrLogRow[] }> {
  const search = filters.search?.trim();
  const gnrWhere: Prisma.GnrReportWhereInput = { deletedAt: null };
  const manualWhere: Prisma.GradeResellItemWhereInput = { deletedAt: null };
  if (search) {
    gnrWhere.OR = [
      { usedMsku: { contains: search, mode: "insensitive" } },
      { usedFnsku: { contains: search, mode: "insensitive" } },
      { asin: { contains: search, mode: "insensitive" } },
      { fnsku: { contains: search, mode: "insensitive" } },
    ];
    manualWhere.OR = [
      { usedMsku: { contains: search, mode: "insensitive" } },
      { usedFnsku: { contains: search, mode: "insensitive" } },
      { asin: { contains: search, mode: "insensitive" } },
      { fnsku: { contains: search, mode: "insensitive" } },
      { msku: { contains: search, mode: "insensitive" } },
    ];
  }

  const [gnrReportRows, manualRows] = await Promise.all([
    prisma.gnrReport.findMany({
      where: gnrWhere,
      select: {
        id: true,
        reportDate: true,
        orderId: true,
        lpn: true,
        valueRecoveryType: true,
        msku: true,
        fnsku: true,
        asin: true,
        quantity: true,
        unitStatus: true,
        reasonForUnitStatus: true,
        usedCondition: true,
        usedMsku: true,
        usedFnsku: true,
      },
    }),
    prisma.gradeResellItem.findMany({
      where: manualWhere,
      select: {
        id: true,
        msku: true,
        fnsku: true,
        asin: true,
        usedMsku: true,
        usedFnsku: true,
        usedCondition: true,
        grade: true,
        quantity: true,
        unitStatus: true,
        orderId: true,
        lpn: true,
        gradedDate: true,
        notes: true,
      },
    }),
  ]);

  const logRows: GnrLogRow[] = [];
  for (const r of gnrReportRows) {
    logRows.push({
      id: r.id,
      entrySource: "report",
      reportDate: fmtIso(r.reportDate),
      orderId: r.orderId ?? "",
      lpn: r.lpn ?? "",
      valueRecoveryType: r.valueRecoveryType ?? "",
      msku: r.msku ?? "",
      fnsku: r.fnsku ?? "",
      asin: r.asin ?? "",
      quantity: r.quantity,
      unitStatus: r.unitStatus ?? "",
      reasonForUnitStatus: r.reasonForUnitStatus ?? "",
      usedCondition: r.usedCondition ?? "",
      usedMsku: r.usedMsku ?? "",
      usedFnsku: r.usedFnsku ?? "",
    });
  }
  for (const r of manualRows) {
    logRows.push({
      id: r.id,
      entrySource: "manual",
      reportDate: fmtIso(r.gradedDate),
      orderId: r.orderId ?? "",
      lpn: r.lpn ?? "",
      valueRecoveryType: "Manual Entry",
      msku: r.msku ?? "",
      fnsku: r.fnsku ?? "",
      asin: r.asin ?? "",
      quantity: r.quantity,
      unitStatus: r.unitStatus ?? "",
      reasonForUnitStatus: r.notes ?? "",
      usedCondition: r.usedCondition ?? r.grade ?? "",
      usedMsku: r.usedMsku ?? "",
      usedFnsku: r.usedFnsku ?? "",
    });
  }
  logRows.sort((a, b) => b.reportDate.localeCompare(a.reportDate));

  return { logRows };
}

export async function saveGnrCaseAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = raiseGnrCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const today = new Date();
    const row = await prisma.caseTracker.create({
      data: {
        msku: v.usedMsku,
        fnsku: v.usedFnsku,
        asin: v.asin,
        reconType: ReconType.GNR,
        referenceId: v.caseId,
        caseReason: v.caseReason,
        unitsClaimed: v.unitsClaimed,
        unitsApproved: v.unitsApproved,
        amountClaimed: new Prisma.Decimal(0),
        amountApproved: new Prisma.Decimal(v.amountApproved),
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

export async function saveGnrAdjustmentAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = gnrAdjustmentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const row = await prisma.manualAdjustment.create({
      data: {
        msku: v.usedMsku,
        asin: v.asin,
        reconType: ReconType.GNR,
        adjType: AdjType.QUANTITY,
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

export async function getGnrReconRemarks(): Promise<
  Record<string, string>
> {
  const rows = await prisma.gnrReconRemark.findMany({
    select: { usedMsku: true, usedFnsku: true, remarks: true },
  });
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.remarks) map[`${r.usedMsku}|${r.usedFnsku}`] = r.remarks;
  }
  return map;
}

export async function saveGnrReconRemark(
  usedMsku: string,
  usedFnsku: string,
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
  const um = (usedMsku ?? "").trim();
  const uf = (usedFnsku ?? "").trim();
  if (!um) return { ok: false, error: "used_msku required" };
  const value = remarks != null ? String(remarks).trim() || null : null;
  try {
    await prisma.gnrReconRemark.upsert({
      where: { usedMsku_usedFnsku: { usedMsku: um, usedFnsku: uf } },
      create: { usedMsku: um, usedFnsku: uf, remarks: value },
      update: { remarks: value },
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }
}
