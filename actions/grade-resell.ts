"use server";

import { Prisma } from "@prisma/client";
import type { GradeResellStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import {
  GradeResellCreateSchema,
  GradeResellMarkAsSoldSchema,
  GradeResellUpdateSchema,
} from "@/lib/validations/grade-resell";

export type GradeResellFilters = {
  status?: GradeResellStatus | "";
  store?: string;
  search?: string;
};

export type GradeResellItemRow = {
  id: string;
  source: string | null;
  sourceRef: string | null;
  msku: string;
  fnsku: string | null;
  asin: string | null;
  title: string | null;
  quantity: number;
  grade: string | null;
  resellPrice: string | null;
  channel: string | null;
  status: GradeResellStatus;
  notes: string | null;
  gradedBy: string | null;
  gradedDate: Date | null;
  soldDate: Date | null;
  soldPrice: string | null;
  orderId: string | null;
  lpn: string | null;
  usedMsku: string | null;
  usedFnsku: string | null;
  usedCondition: string | null;
  unitStatus: string | null;
  store: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const REVALIDATE_PATHS = [
  "/grade-resell",
  "/gnr-reconciliation",
  "/full-reconciliation",
];

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) {
    try {
      revalidatePath(p);
    } catch {
      // ignore
    }
  }
}

function serializeRow(
  r: Prisma.GradeResellItemGetPayload<Record<string, never>>,
): GradeResellItemRow {
  return {
    ...r,
    resellPrice: r.resellPrice ? r.resellPrice.toString() : null,
    soldPrice: r.soldPrice ? r.soldPrice.toString() : null,
  };
}

export async function getGradeResellItems(
  filters: GradeResellFilters = {},
): Promise<GradeResellItemRow[]> {
  const where: Prisma.GradeResellItemWhereInput = {
    deletedAt: null,
  };

  if (filters.status) {
    where.status = filters.status;
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
      { fnsku: { contains: q, mode: "insensitive" } },
      { asin: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.gradeResellItem.findMany({
    where,
    orderBy: [{ gradedDate: "desc" }, { createdAt: "desc" }],
  });

  return rows.map(serializeRow);
}

export async function getGradeResellItemById(
  id: string,
): Promise<GradeResellItemRow | null> {
  const row = await prisma.gradeResellItem.findFirst({
    where: { id, deletedAt: null },
  });
  return row ? serializeRow(row) : null;
}

function toCreateInput(
  v: import("@/lib/validations/grade-resell").GradeResellCreateValues,
): Prisma.GradeResellItemUncheckedCreateInput {
  return {
    source: v.source ?? "manual",
    sourceRef: v.sourceRef,
    msku: v.msku,
    fnsku: v.fnsku,
    asin: v.asin,
    title: v.title,
    quantity: v.quantity,
    grade: v.grade,
    resellPrice:
      v.resellPrice != null ? new Prisma.Decimal(v.resellPrice) : null,
    channel: v.channel,
    status: v.status,
    notes: v.notes,
    gradedBy: v.gradedBy,
    gradedDate: v.gradedDate ?? undefined,
    soldDate: v.soldDate ?? undefined,
    soldPrice: v.soldPrice != null ? new Prisma.Decimal(v.soldPrice) : null,
    orderId: v.orderId,
    lpn: v.lpn,
    usedMsku: v.usedMsku,
    usedFnsku: v.usedFnsku,
    usedCondition: v.usedCondition,
    unitStatus: v.unitStatus,
    store: v.store,
  };
}

export async function createGradeResellItem(
  raw: unknown,
): Promise<MutationResult<{ id: string; merged: boolean }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = GradeResellCreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Invalid grade & resell data." };
  }

  const v = parsed.data;
  const uMsk = v.usedMsku?.trim() || null;
  const uFnk = v.usedFnsku?.trim() || null;

  try {
    if (uMsk && uFnk) {
      const existing = await prisma.gradeResellItem.findFirst({
        where: { usedMsku: uMsk, usedFnsku: uFnk, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        const merged = await prisma.gradeResellItem.update({
          where: { id: existing.id },
          data: {
            quantity: { increment: v.quantity },
            orderId: v.orderId ?? undefined,
            lpn: v.lpn ?? undefined,
            usedCondition: v.usedCondition ?? undefined,
            unitStatus: v.unitStatus ?? undefined,
            grade: v.grade ?? undefined,
            gradedBy: v.gradedBy ?? undefined,
            notes: v.notes ?? undefined,
            gradedDate: v.gradedDate ?? undefined,
          },
          select: { id: true },
        });
        revalidateAll();
        return { ok: true, data: { id: merged.id, merged: true } };
      }
    }

    const row = await prisma.gradeResellItem.create({
      data: toCreateInput(v),
      select: { id: true },
    });
    revalidateAll();
    return { ok: true, data: { id: row.id, merged: false } };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not create grade & resell item.";
    return { ok: false, error: msg };
  }
}

export async function updateGradeResellItem(
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
  const parsed = GradeResellUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Invalid grade & resell data." };
  }

  const { id: rowId, ...rest } = parsed.data;

  try {
    const existing = await prisma.gradeResellItem.findFirst({
      where: { id: rowId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false, error: "Grade & resell item not found." };
    }

    await prisma.gradeResellItem.update({
      where: { id: rowId },
      data: toCreateInput(rest),
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not update grade & resell item.";
    return { ok: false, error: msg };
  }
}

export async function deleteGradeResellItem(
  id: string,
): Promise<MutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  try {
    const result = await prisma.gradeResellItem.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      return { ok: false, error: "Grade & resell item not found." };
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not delete grade & resell item.";
    return { ok: false, error: msg };
  }
}

export async function markAsSold(raw: unknown): Promise<MutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = GradeResellMarkAsSoldSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Invalid mark-as-sold data." };
  }

  const { id, soldPrice, soldDate } = parsed.data;

  try {
    const existing = await prisma.gradeResellItem.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false, error: "Grade & resell item not found." };
    }

    await prisma.gradeResellItem.update({
      where: { id },
      data: {
        status: "SOLD",
        soldDate: soldDate ?? new Date(),
        soldPrice: soldPrice != null ? new Prisma.Decimal(soldPrice) : null,
      },
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not mark as sold.";
    return { ok: false, error: msg };
  }
}
