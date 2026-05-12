"use server";

import { Prisma } from "@prisma/client";
import type { AdjType, CaseStatus, ReconType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { serializeCaseTrackerRow } from "@/lib/case-tracker-serialize";
import {
  CaseTrackerCreateSchema,
  CaseTrackerFullUpdateSchema,
  ManualAdjustmentCreateSchema,
  ManualAdjustmentFullUpdateSchema,
} from "@/lib/validations/cases";
import { requireAuth } from "@/actions/auth";

export type CaseFilters = {
  status?: CaseStatus | "";
  reconType?: ReconType | "";
  store?: string;
  search?: string;
};

export type AdjustmentFilters = {
  reconType?: ReconType | "";
  store?: string;
  search?: string;
};

export type CaseTrackerRow = {
  id: string;
  msku: string | null;
  asin: string | null;
  fnsku: string | null;
  title: string | null;
  reconType: ReconType;
  shipmentId: string | null;
  orderId: string | null;
  referenceId: string | null;
  caseReason: string | null;
  unitsClaimed: number;
  unitsApproved: number;
  amountClaimed: string | null;
  amountApproved: string | null;
  currency: string | null;
  status: CaseStatus;
  issueDate: Date | null;
  raisedDate: Date | null;
  resolvedDate: Date | null;
  notes: string | null;
  store: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ManualAdjustmentRow = {
  id: string;
  msku: string | null;
  asin: string | null;
  fnsku: string | null;
  title: string | null;
  reconType: ReconType;
  shipmentId: string | null;
  orderId: string | null;
  referenceId: string | null;
  adjType: AdjType;
  qtyBefore: number;
  qtyAdjusted: number;
  qtyAfter: number;
  reason: string | null;
  verifiedBy: string | null;
  sourceDoc: string | null;
  notes: string | null;
  adjDate: Date | null;
  store: string | null;
  caseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export async function getCases(
  filters: CaseFilters = {},
): Promise<CaseTrackerRow[]> {
  const where: Prisma.CaseTrackerWhereInput = {
    deletedAt: null,
  };

  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.reconType) {
    where.reconType = filters.reconType;
  }
  if (filters.store?.trim()) {
    where.store = {
      contains: filters.store.trim(),
      mode: "insensitive",
    };
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { msku: { contains: q, mode: "insensitive" } },
      { asin: { contains: q, mode: "insensitive" } },
      { fnsku: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.caseTracker.findMany({
    where,
    orderBy: [{ raisedDate: "desc" }, { createdAt: "desc" }],
  });

  return rows.map(serializeCaseTrackerRow);
}

export async function getCaseById(
  id: string,
): Promise<CaseTrackerRow | null> {
  const row = await prisma.caseTracker.findFirst({
    where: { id, deletedAt: null },
  });
  return row ? serializeCaseTrackerRow(row) : null;
}

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function toCaseCreateInput(
  v: import("@/lib/validations/cases").CaseTrackerCreateValues,
): Prisma.CaseTrackerCreateInput {
  return {
    msku: v.msku,
    asin: v.asin,
    fnsku: v.fnsku,
    title: v.title,
    reconType: v.reconType,
    shipmentId: v.shipmentId,
    orderId: v.orderId,
    referenceId: v.referenceId,
    caseReason: v.caseReason,
    unitsClaimed: v.unitsClaimed,
    unitsApproved: v.unitsApproved,
    amountClaimed:
      v.amountClaimed != null ? new Prisma.Decimal(v.amountClaimed) : null,
    amountApproved:
      v.amountApproved != null ? new Prisma.Decimal(v.amountApproved) : null,
    currency: v.currency ?? undefined,
    status: v.status,
    issueDate: v.issueDate ?? undefined,
    raisedDate: v.raisedDate ?? undefined,
    resolvedDate: v.resolvedDate ?? undefined,
    notes: v.notes,
    store: v.store,
  };
}

export async function createCase(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = CaseTrackerCreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Invalid case data." };
  }

  try {
    const row = await prisma.caseTracker.create({
      data: toCaseCreateInput(parsed.data),
    });
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create case.";
    return { ok: false, error: msg };
  }
}

export async function updateCase(
  id: string,
  raw: unknown,
): Promise<MutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const payload =
    typeof raw === "object" && raw !== null ? { ...raw, id } : { id };
  const parsed = CaseTrackerFullUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Invalid case data." };
  }

  const { id: rowId, ...rest } = parsed.data;

  try {
    const existing = await prisma.caseTracker.findFirst({
      where: { id: rowId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false, error: "Case not found." };
    }

    await prisma.caseTracker.update({
      where: { id: rowId },
      data: toCaseCreateInput(rest),
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update case.";
    return { ok: false, error: msg };
  }
}

export async function deleteCase(id: string): Promise<MutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  try {
    const result = await prisma.caseTracker.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      return { ok: false, error: "Case not found." };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not delete case.";
    return { ok: false, error: msg };
  }
}

function toAdjustmentUncheckedWrite(
  v: import("@/lib/validations/cases").ManualAdjustmentCreateValues,
): Prisma.ManualAdjustmentUncheckedCreateInput {
  const qtyAfter = v.qtyBefore + v.qtyAdjusted;
  return {
    msku: v.msku,
    asin: v.asin,
    fnsku: v.fnsku,
    title: v.title,
    reconType: v.reconType,
    shipmentId: v.shipmentId,
    orderId: v.orderId,
    referenceId: v.referenceId,
    adjType: v.adjType,
    qtyBefore: v.qtyBefore,
    qtyAdjusted: v.qtyAdjusted,
    qtyAfter,
    reason: v.reason,
    verifiedBy: v.verifiedBy,
    sourceDoc: v.sourceDoc,
    notes: v.notes,
    adjDate: v.adjDate ?? undefined,
    store: v.store,
    caseId: v.caseId ?? null,
  };
}

export async function getAdjustments(
  filters: AdjustmentFilters = {},
): Promise<ManualAdjustmentRow[]> {
  const where: Prisma.ManualAdjustmentWhereInput = {
    deletedAt: null,
  };

  if (filters.reconType) {
    where.reconType = filters.reconType;
  }
  if (filters.store?.trim()) {
    where.store = {
      contains: filters.store.trim(),
      mode: "insensitive",
    };
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { msku: { contains: q, mode: "insensitive" } },
      { asin: { contains: q, mode: "insensitive" } },
      { fnsku: { contains: q, mode: "insensitive" } },
    ];
  }

  return prisma.manualAdjustment.findMany({
    where,
    orderBy: [{ adjDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function getAdjustmentById(
  id: string,
): Promise<ManualAdjustmentRow | null> {
  return prisma.manualAdjustment.findFirst({
    where: { id, deletedAt: null },
  });
}

export async function createAdjustment(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = ManualAdjustmentCreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Invalid adjustment data." };
  }

  try {
    const row = await prisma.manualAdjustment.create({
      data: toAdjustmentUncheckedWrite(parsed.data),
    });
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create adjustment.";
    return { ok: false, error: msg };
  }
}

export async function updateAdjustment(
  id: string,
  raw: unknown,
): Promise<MutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const payload =
    typeof raw === "object" && raw !== null ? { ...raw, id } : { id };
  const parsed = ManualAdjustmentFullUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Invalid adjustment data." };
  }

  const { id: rowId, ...rest } = parsed.data;

  try {
    const existing = await prisma.manualAdjustment.findFirst({
      where: { id: rowId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false, error: "Adjustment not found." };
    }

    await prisma.manualAdjustment.update({
      where: { id: rowId },
      data: toAdjustmentUncheckedWrite(rest),
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update adjustment.";
    return { ok: false, error: msg };
  }
}

export async function deleteAdjustment(id: string): Promise<MutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  try {
    const result = await prisma.manualAdjustment.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      return { ok: false, error: "Adjustment not found." };
    }
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not delete adjustment.";
    return { ok: false, error: msg };
  }
}
