"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import {
  authzErrorToMutationResult,
  PermissionLevel,
  PermissionModule,
  requireLevel,
} from "@/lib/auth/rbac";
import {
  InboundShipmentUpsertSchema,
  type InboundShipmentUpsertValues,
} from "@/lib/validations/inbound-recon";

export type InboundShipmentFilters = {
  search?: string;
};

export type InboundShipmentRow = {
  id: string;
  shipmentId: string;
  manualProcFee: string | null;
  placementFee: string | null;
  partneredCarrier: string | null;
  shipmentName: string | null;
  createdDate: Date | null;
  lastUpdated: Date | null;
  unitsLocated: number | null;
  shipmentStatus: string | null;
  shipTo: string | null;
  settledTransport: string | null;
  settledPlacement: string | null;
  settlementIds: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const REVALIDATE_PATHS = ["/payment-reconciliation/inbound-recon"];

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
  r: Prisma.InboundShipmentGetPayload<Record<string, never>>,
): InboundShipmentRow {
  return {
    ...r,
    manualProcFee: r.manualProcFee ? r.manualProcFee.toString() : null,
    placementFee: r.placementFee ? r.placementFee.toString() : null,
    partneredCarrier: r.partneredCarrier ? r.partneredCarrier.toString() : null,
    settledTransport: r.settledTransport ? r.settledTransport.toString() : null,
    settledPlacement: r.settledPlacement ? r.settledPlacement.toString() : null,
  };
}

export async function getInboundShipments(
  filters: InboundShipmentFilters = {},
): Promise<InboundShipmentRow[]> {
  const where: Prisma.InboundShipmentWhereInput = {
    deletedAt: null,
  };

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.shipmentId = { contains: q, mode: "insensitive" };
  }

  const rows = await prisma.inboundShipment.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
  });

  return rows.map(serializeRow);
}

export async function getInboundShipmentById(
  id: string,
): Promise<InboundShipmentRow | null> {
  const row = await prisma.inboundShipment.findFirst({
    where: { id, deletedAt: null },
  });
  return row ? serializeRow(row) : null;
}

function toWriteInput(
  v: InboundShipmentUpsertValues,
): Prisma.InboundShipmentUncheckedCreateInput {
  return {
    shipmentId: v.shipmentId,
    manualProcFee:
      v.manualProcFee != null ? new Prisma.Decimal(v.manualProcFee) : null,
    placementFee:
      v.placementFee != null ? new Prisma.Decimal(v.placementFee) : null,
    partneredCarrier:
      v.partneredCarrier != null
        ? new Prisma.Decimal(v.partneredCarrier)
        : null,
  };
}

type InboundSnapshotPatch = {
  shipmentName: string | null;
  createdDate: Date | null;
  lastUpdated: Date | null;
  unitsLocated: number | null;
  shipmentStatus: string | null;
  shipTo: string | null;
};

function normalizeShipmentId(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

async function fetchSnapshotForShipmentId(
  shipmentId: string,
): Promise<InboundSnapshotPatch | null> {
  const id = shipmentId.trim();
  if (!id) return null;
  // Prisma cannot TRIM the stored column in WHERE, so widen with a
  // case-insensitive `contains`, then verify trim-equal in JS — handles
  // ShipmentStatus rows that contain leading/trailing whitespace.
  const candidates = await prisma.shipmentStatus.findMany({
    where: {
      shipmentId: { contains: id, mode: "insensitive" },
      deletedAt: null,
    },
    select: {
      shipmentName: true,
      shipmentId: true,
      createdDate: true,
      lastUpdated: true,
      unitsLocated: true,
      status: true,
      shipTo: true,
    },
  });
  const key = normalizeShipmentId(id);
  const match = candidates.find(
    (c) => normalizeShipmentId(c.shipmentId) === key,
  );
  if (!match) return null;
  return {
    shipmentName: match.shipmentName,
    createdDate: match.createdDate,
    lastUpdated: match.lastUpdated,
    unitsLocated: match.unitsLocated,
    shipmentStatus: match.status,
    shipTo: match.shipTo,
  };
}

type InboundActualsPatch = {
  settledTransport: number | null;
  settledPlacement: number | null;
  settlementIds: string | null;
};

const FEE_DESC_TRANSPORT = "Inbound Transportation Fee";
const FEE_DESC_PLACEMENT = "FBA Inbound Placement Service Fee";
const FEE_DESC_TRANSPORT_LC = FEE_DESC_TRANSPORT.toLowerCase();
const FEE_DESC_PLACEMENT_LC = FEE_DESC_PLACEMENT.toLowerCase();

async function fetchActualsForShipmentId(
  shipmentId: string,
): Promise<InboundActualsPatch | null> {
  const id = shipmentId.trim();
  if (!id) return null;
  const rows = await prisma.settlementReport.findMany({
    where: {
      shipmentId: { equals: id, mode: "insensitive" },
      amountDescription: {
        in: [FEE_DESC_TRANSPORT, FEE_DESC_PLACEMENT],
        mode: "insensitive",
      },
      deletedAt: null,
    },
    select: {
      settlementId: true,
      amountDescription: true,
      amount: true,
    },
  });
  let transport = 0;
  let placement = 0;
  let hasTransport = false;
  let hasPlacement = false;
  const sids = new Set<string>();
  for (const r of rows) {
    const desc = (r.amountDescription ?? "").trim().toLowerCase();
    const amt = r.amount == null ? 0 : Number(r.amount);
    if (!Number.isFinite(amt)) continue;
    if (desc === FEE_DESC_TRANSPORT_LC) {
      transport += amt;
      hasTransport = true;
      if (r.settlementId) sids.add(r.settlementId);
    } else if (desc === FEE_DESC_PLACEMENT_LC) {
      placement += amt;
      hasPlacement = true;
      if (r.settlementId) sids.add(r.settlementId);
    }
  }
  if (!hasTransport && !hasPlacement && sids.size === 0) return null;
  return {
    settledTransport: hasTransport ? transport : null,
    settledPlacement: hasPlacement ? placement : null,
    settlementIds: sids.size > 0 ? Array.from(sids).join(", ") : null,
  };
}

async function applySnapshotToInboundRow(
  inboundId: string,
  shipmentId: string,
): Promise<void> {
  try {
    const [snapshot, actuals] = await Promise.all([
      fetchSnapshotForShipmentId(shipmentId),
      fetchActualsForShipmentId(shipmentId),
    ]);
    const data: Prisma.InboundShipmentUncheckedUpdateInput = {
      ...(snapshot ?? {}),
      ...(actuals ?? {}),
    };
    if (Object.keys(data).length === 0) return;
    await prisma.inboundShipment.update({
      where: { id: inboundId },
      data,
    });
  } catch (err) {
    // Snapshot is best-effort — never block the primary save.
    console.warn(
      "[inbound-recon] post-save snapshot apply failed",
      inboundId,
      shipmentId,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function upsertInboundShipment(
  raw: unknown,
): Promise<MutationResult<{ id: string; created: boolean }>> {
  try {
    await requireAuth();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unauthorized.",
    };
  }

  const parsed = InboundShipmentUpsertSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Invalid inbound shipment data." };
  }

  const v = parsed.data;

  try {
    if (v.id) {
      const existing = await prisma.inboundShipment.findFirst({
        where: { id: v.id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) {
        return { ok: false, error: "Inbound shipment not found." };
      }
      await prisma.inboundShipment.update({
        where: { id: v.id },
        data: toWriteInput(v),
      });
      await applySnapshotToInboundRow(v.id, v.shipmentId);
      revalidateAll();
      return { ok: true, data: { id: v.id, created: false } };
    }

    const row = await prisma.inboundShipment.create({
      data: toWriteInput(v),
      select: { id: true },
    });
    await applySnapshotToInboundRow(row.id, v.shipmentId);
    revalidateAll();
    return { ok: true, data: { id: row.id, created: true } };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not save inbound shipment.";
    return { ok: false, error: msg };
  }
}

export async function syncInboundSnapshotsForShipmentIds(
  shipmentIds: string[],
): Promise<{ updated: number }> {
  const trimmed = Array.from(
    new Set(
      shipmentIds
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter((s) => s.length > 0),
    ),
  );
  if (trimmed.length === 0) return { updated: 0 };

  let updated = 0;
  for (const sid of trimmed) {
    try {
      const patch = await fetchSnapshotForShipmentId(sid);
      if (!patch) continue;
      const candidates = await prisma.inboundShipment.findMany({
        where: {
          shipmentId: { contains: sid, mode: "insensitive" },
          deletedAt: null,
        },
        select: { id: true, shipmentId: true },
      });
      const key = normalizeShipmentId(sid);
      const ids = candidates
        .filter((c) => normalizeShipmentId(c.shipmentId) === key)
        .map((c) => c.id);
      if (ids.length === 0) continue;
      const result = await prisma.inboundShipment.updateMany({
        where: { id: { in: ids } },
        data: patch,
      });
      updated += result.count;
    } catch (err) {
      // Snapshot sync is best-effort per shipment.
      console.warn(
        "[inbound-recon] per-shipment snapshot sync failed",
        sid,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (updated > 0) revalidateAll();
  return { updated };
}

export type ResyncResult =
  | { ok: true; rowsUpserted: number }
  | { ok: false; error: string };

export async function resyncAllInboundSnapshots(): Promise<ResyncResult> {
  try {
    await requireAuth();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unauthorized.",
    };
  }
  try {
    const [inbound, statuses, settlementRows] = await Promise.all([
      prisma.inboundShipment.findMany({
        where: { deletedAt: null },
        select: { id: true, shipmentId: true },
      }),
      prisma.shipmentStatus.findMany({
        where: { deletedAt: null, NOT: { shipmentId: null } },
        select: {
          shipmentId: true,
          shipmentName: true,
          createdDate: true,
          lastUpdated: true,
          unitsLocated: true,
          status: true,
          shipTo: true,
        },
      }),
      prisma.settlementReport.findMany({
        where: {
          deletedAt: null,
          NOT: { shipmentId: null },
          amountDescription: {
            in: [FEE_DESC_TRANSPORT, FEE_DESC_PLACEMENT],
            mode: "insensitive",
          },
        },
        select: {
          shipmentId: true,
          amountDescription: true,
          amount: true,
          settlementId: true,
        },
      }),
    ]);

    const ssByKey = new Map<string, (typeof statuses)[number]>();
    for (const s of statuses) {
      const k = normalizeShipmentId(s.shipmentId);
      if (k) ssByKey.set(k, s);
    }

    type ActualsAccum = {
      transport: number;
      placement: number;
      hasTransport: boolean;
      hasPlacement: boolean;
      sids: Set<string>;
    };
    const actualsByKey = new Map<string, ActualsAccum>();
    for (const r of settlementRows) {
      const k = normalizeShipmentId(r.shipmentId);
      if (!k) continue;
      const desc = (r.amountDescription ?? "").trim().toLowerCase();
      const amt = r.amount == null ? 0 : Number(r.amount);
      if (!Number.isFinite(amt)) continue;
      let bucket = actualsByKey.get(k);
      if (!bucket) {
        bucket = {
          transport: 0,
          placement: 0,
          hasTransport: false,
          hasPlacement: false,
          sids: new Set(),
        };
        actualsByKey.set(k, bucket);
      }
      if (desc === FEE_DESC_TRANSPORT_LC) {
        bucket.transport += amt;
        bucket.hasTransport = true;
        if (r.settlementId) bucket.sids.add(r.settlementId);
      } else if (desc === FEE_DESC_PLACEMENT_LC) {
        bucket.placement += amt;
        bucket.hasPlacement = true;
        if (r.settlementId) bucket.sids.add(r.settlementId);
      }
    }

    let updated = 0;
    let lastRowError: unknown = null;
    let skippedNoMatch = 0;
    for (const row of inbound) {
      const k = normalizeShipmentId(row.shipmentId);
      if (!k) continue;
      const ss = ssByKey.get(k);
      const ac = actualsByKey.get(k);
      if (!ss && !ac) {
        skippedNoMatch += 1;
        continue;
      }
      try {
        const data: Prisma.InboundShipmentUncheckedUpdateInput = {};
        if (ss) {
          data.shipmentName = ss.shipmentName;
          data.createdDate = ss.createdDate;
          data.lastUpdated = ss.lastUpdated;
          data.unitsLocated = ss.unitsLocated;
          data.shipmentStatus = ss.status;
          data.shipTo = ss.shipTo;
        }
        if (ac) {
          data.settledTransport = ac.hasTransport ? ac.transport : null;
          data.settledPlacement = ac.hasPlacement ? ac.placement : null;
          data.settlementIds =
            ac.sids.size > 0 ? Array.from(ac.sids).join(", ") : null;
        }
        await prisma.inboundShipment.update({
          where: { id: row.id },
          data,
        });
        updated += 1;
      } catch (rowErr) {
        lastRowError = rowErr;
        console.warn(
          "[inbound-recon resync] update failed for inbound row",
          row.id,
          rowErr instanceof Error ? rowErr.message : rowErr,
        );
      }
    }

    if (updated === 0 && inbound.length > 0) {
      console.warn(
        `[inbound-recon resync] zero rows updated. inbound=${inbound.length} statuses=${statuses.length} settlementRows=${settlementRows.length} matchedSkipped=${skippedNoMatch}`,
      );
      if (lastRowError) {
        const msg =
          lastRowError instanceof Error
            ? lastRowError.message
            : String(lastRowError);
        return {
          ok: false,
          error: `Resync failed: ${msg}. (Have you applied the latest Prisma migration?)`,
        };
      }
    }

    if (updated > 0) revalidateAll();
    return { ok: true, rowsUpserted: updated };
  } catch (e) {
    console.warn(
      "[inbound-recon resync] fatal error",
      e instanceof Error ? e.message : e,
    );
    const msg =
      e instanceof Error ? e.message : "Could not resync inbound snapshots.";
    return { ok: false, error: msg };
  }
}

export async function deleteInboundShipment(
  id: string,
): Promise<MutationResult> {
  try {
    await requireLevel(PermissionModule.RECONCILIATION, PermissionLevel.FULL);
  } catch (e) {
    return authzErrorToMutationResult(e);
  }
  try {
    const result = await prisma.inboundShipment.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      return { ok: false, error: "Inbound shipment not found." };
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not delete inbound shipment.";
    return { ok: false, error: msg };
  }
}
