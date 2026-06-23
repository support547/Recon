import "server-only";
import { headers } from "next/headers";
import { AuditAction, Prisma } from "@prisma/client";

import { getTenantPrisma, getTenantPrismaByUrl } from "@/lib/prisma";

export { AuditAction };

export type AuditMetadata =
  | Prisma.InputJsonValue
  | Record<string, unknown>
  | { before?: unknown; after?: unknown }
  | null
  | undefined;

export type RecordAuditInput = {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetEmail?: string | null;
  summary: string;
  metadata?: AuditMetadata;
  ipAddress?: string | null;
  /** Explicit tenant DB URL (used by login flow where session isn't ready
   *  yet). When omitted, the tenant client is resolved from the session. */
  databaseUrl?: string | null;
};

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

export async function recordAudit(input: RecordAuditInput): Promise<void> {
  const ipAddress = input.ipAddress ?? (await readClientIp());

  try {
    const prisma = input.databaseUrl
      ? getTenantPrismaByUrl(input.databaseUrl)
      : await getTenantPrisma();
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
