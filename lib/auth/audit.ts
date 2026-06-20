import "server-only";
import { headers } from "next/headers";
import { AuditAction, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export { AuditAction };

export type AuditMetadata =
  | Prisma.InputJsonValue
  | Record<string, unknown>
  | { before?: unknown; after?: unknown }
  | null
  | undefined;

export type RecordAuditInput = {
  action: AuditAction;
  /** Null for failed logins and system-generated events; an actor id otherwise. */
  actorId?: string | null;
  /** Snapshot — preserved even if the actor user is later deleted. */
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetEmail?: string | null;
  summary: string;
  metadata?: AuditMetadata;
  /** Optional override; otherwise read from the incoming request headers. */
  ipAddress?: string | null;
};

/**
 * Best-effort client IP from common reverse-proxy headers. Returns null when
 * we cannot derive one (e.g. called outside a request scope).
 */
async function readClientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) {
      const first = fwd.split(",")[0]?.trim();
      if (first) return first;
    }
    const real = h.get("x-real-ip");
    if (real) return real.trim();
    return null;
  } catch {
    return null;
  }
}

function normalizeMetadata(
  metadata: AuditMetadata,
): Prisma.InputJsonValue | undefined {
  if (metadata === undefined || metadata === null) return undefined;
  return metadata as Prisma.InputJsonValue;
}

/**
 * Append-only audit log writer. Writes exactly one row and never updates or
 * deletes existing rows. Failures are swallowed and logged — audit writes
 * MUST NOT break the calling action (e.g. a successful login must not be
 * rejected because the audit insert hit a transient DB error).
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  const ipAddress = input.ipAddress ?? (await readClientIp());

  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        targetEmail: input.targetEmail ?? null,
        summary: input.summary,
        metadata: normalizeMetadata(input.metadata),
        ipAddress: ipAddress ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] failed to record:", input.action, e);
  }
}
