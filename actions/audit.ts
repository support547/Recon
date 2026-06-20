"use server";

import { AuditAction, PermissionLevel, PermissionModule, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireLevel } from "@/lib/auth/rbac";

/* ============================================================
 * Read-only access to the append-only audit log. ADMIN only.
 * No write/update/delete code paths exist here — the audit log is
 * tamper-resistant by construction.
 * ============================================================ */

const MAX_PAGE_SIZE = 200;

export type AuditLogFilters = {
  actorId?: string;
  /** Filter by either actor or target user id. */
  userId?: string;
  action?: AuditAction;
  from?: Date | string | null;
  to?: Date | string | null;
};

export type AuditLogPagination = {
  /** 1-based page number. */
  page?: number;
  /** Rows per page; clamped to [1, 200]. Defaults to 50. */
  pageSize?: number;
};

export type AuditLogRow = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  targetEmail: string | null;
  summary: string;
  metadata: Prisma.JsonValue | null;
  ipAddress: string | null;
  createdAt: Date;
};

export type AuditLogPage = {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
};

function toDate(v: Date | string | null | undefined): Date | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : undefined;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

export async function listAuditLog(input?: {
  filters?: AuditLogFilters;
  pagination?: AuditLogPagination;
}): Promise<AuditLogPage> {
  await requireLevel(PermissionModule.AUDIT, PermissionLevel.VIEW);

  const filters = input?.filters ?? {};
  const pagination = input?.pagination ?? {};

  const page = Math.max(1, Math.floor(pagination.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(pagination.pageSize ?? 50)),
  );

  const where: Prisma.AuditLogWhereInput = {};
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.action) where.action = filters.action;

  const from = toDate(filters.from);
  const to = toDate(filters.to);
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  if (filters.userId) {
    // Match either side of the action: the actor who did it OR the user it
    // was done to. Lets the admin see everything touching a given user.
    where.OR = [
      { actorId: filters.userId },
      { targetType: "User", targetId: filters.userId },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        actorId: true,
        actorEmail: true,
        action: true,
        targetType: true,
        targetId: true,
        targetEmail: true,
        summary: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}
