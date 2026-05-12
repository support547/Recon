"use server";

import { AdjType, CaseStatus, Prisma, ReconType } from "@prisma/client";

import {
  createAdjustment,
  createCase,
  deleteAdjustment,
  deleteCase,
  type CaseTrackerRow,
  type ManualAdjustmentRow,
  type MutationResult,
  updateAdjustment,
  updateCase,
} from "@/actions/cases";
import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import { serializeCaseTrackerRow } from "@/lib/case-tracker-serialize";
import {
  buildLostInboundReimbMap,
  buildReceiptQuantityMap,
  buildShipmentMetaMap,
  computeReconRows,
  mergeCaseIntoOverlay,
  trimCl,
  type ActionCacheEntry,
  type ShipmentMeta,
  type ShipmentReconRow,
} from "@/lib/shipment-reconciliation-logic";
import {
  shipmentCaStandaloneAdjustmentSchema,
  shipmentCaStandaloneCaseSchema,
  shipmentReconAdjActionSchema,
  shipmentReconCaseActionSchema,
} from "@/lib/validations/shipment-reconciliation";

export type ShipmentReconciliationPayload = {
  rows: ShipmentReconRow[];
  overlay: Record<string, ActionCacheEntry>;
  shipmentOptions: { id: string; status: string; dateKey: string }[];
};

function legacyCaseStatusToPrisma(s: string): CaseStatus {
  switch (s) {
    case "pending":
      return CaseStatus.OPEN;
    case "raised":
      return CaseStatus.IN_PROGRESS;
    case "approved":
      return CaseStatus.RESOLVED;
    case "partial":
      return CaseStatus.IN_PROGRESS;
    case "rejected":
      return CaseStatus.REJECTED;
    case "closed":
      return CaseStatus.CLOSED;
    default:
      return CaseStatus.OPEN;
  }
}

function legacyReconStringToEnum(s: string): ReconType | undefined {
  const map: Record<string, ReconType> = {
    shipment: ReconType.SHIPMENT,
    removal: ReconType.REMOVAL,
    return: ReconType.RETURN,
    fc_transfer: ReconType.FC_TRANSFER,
    fba_balance: ReconType.FBA_BALANCE,
    other: ReconType.OTHER,
  };
  return map[s];
}

function emptyToNull(s?: string | null): string | null {
  const t = String(s ?? "").trim();
  return t.length ? t : null;
}

function parseOptionalAmount(v: unknown): number | null {
  if (v === "" || v === undefined || v === null) return null;
  const n =
    typeof v === "number" ? v : Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseOptionalDate(s?: string): Date | undefined {
  if (!s?.trim()) return undefined;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function caseStatusToLegacyTopRank(status: string): string {
  switch (status) {
    case "OPEN":
      return "pending";
    case "IN_PROGRESS":
      return "raised";
    case "RESOLVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "CLOSED":
      return "closed";
    default:
      return "pending";
  }
}

async function buildActionOverlay(): Promise<Record<string, ActionCacheEntry>> {
  const overlay: Record<string, ActionCacheEntry> = {};

  const cases = await prisma.caseTracker.findMany({
    where: { deletedAt: null, reconType: ReconType.SHIPMENT },
    select: {
      id: true,
      fnsku: true,
      shipmentId: true,
      unitsClaimed: true,
      unitsApproved: true,
      amountApproved: true,
      status: true,
      referenceId: true,
    },
  });

  for (const c of cases) {
    const keys: string[] = [];
    const fk = trimCl(c.fnsku);
    const sid = trimCl(c.shipmentId);
    if (fk) keys.push(fk);
    if (sid) keys.push(sid);
    if (!keys.length) continue;

    const rawAmt = c.amountApproved;
    const amt = rawAmt == null ? 0 : Number(rawAmt);

    mergeCaseIntoOverlay(overlay, keys, {
      total_claimed: c.unitsClaimed,
      total_approved: c.unitsApproved,
      total_amount: Number.isFinite(amt) ? amt : 0,
      case_count: 1,
      case_ids: (c.referenceId || c.id).trim(),
      top_status: caseStatusToLegacyTopRank(c.status),
    });
  }

  const adjs = await prisma.manualAdjustment.findMany({
    where: { deletedAt: null, reconType: ReconType.SHIPMENT },
    select: { fnsku: true, qtyAdjusted: true },
  });

  for (const a of adjs) {
    const k = trimCl(a.fnsku);
    if (!k) continue;
    if (!overlay[k]) {
      overlay[k] = {
        case_raised: 0,
        case_approved: 0,
        case_amount: 0,
        adj_qty: 0,
        case_status: null,
        case_count: 0,
        case_ids: [],
      };
    }
    overlay[k].adj_qty += Number(a.qtyAdjusted) || 0;
  }

  return overlay;
}

export async function getShipmentReconciliationData(filters: {
  shipmentStatus: string;
  shipmentId: string;
}): Promise<ShipmentReconciliationPayload> {
  const [shippedRows, statusRows, receipts, reimbs] = await Promise.all([
    prisma.shippedToFba.findMany({
      where: { deletedAt: null },
      select: {
        shipmentId: true,
        msku: true,
        title: true,
        asin: true,
        fnsku: true,
        quantity: true,
        shipDate: true,
      },
    }),
    prisma.shipmentStatus.findMany({
      where: { deletedAt: null },
      select: { shipmentId: true, status: true, lastUpdated: true },
    }),
    prisma.fbaReceipt.findMany({
      select: { fnsku: true, quantity: true },
    }),
    prisma.reimbursement.findMany({
      select: { fnsku: true, reason: true, quantity: true },
    }),
  ]);

  const shipMap: Record<string, ShipmentMeta> = buildShipmentMetaMap(statusRows);
  const rcMap = buildReceiptQuantityMap(receipts);
  const riMap = buildLostInboundReimbMap(reimbs);

  if (process.env.NODE_ENV !== "production") {
    const totalReceiptQty = receipts.reduce(
      (s, r) => s + (Number(r.quantity) || 0),
      0,
    );
    console.log("[shipment-recon] receipt rows:", receipts.length);
    console.log("[shipment-recon] receipt qty sum:", totalReceiptQty);
    console.log("[shipment-recon] rcMap size:", Object.keys(rcMap).length);
    console.log(
      "[shipment-recon] rcMap sample:",
      Object.entries(rcMap).slice(0, 5),
    );
    console.log("[shipment-recon] reimb rows:", reimbs.length);
    console.log("[shipment-recon] riMap size:", Object.keys(riMap).length);
  }

  const sidSet = new Set<string>();
  for (const s of shippedRows) {
    const sid = String(s.shipmentId ?? "").trim();
    if (!sid) continue;
    sidSet.add(sid);
  }
  const shipmentIds = [...sidSet];
  const sortedIds = shipmentIds.sort((a, b) => {
    const pri: Record<string, number> = {
      Closed: 0,
      Receiving: 1,
      Working: 2,
      Shipped: 3,
    };
    const sa = shipMap[a]?.status ?? "Unknown";
    const sb = shipMap[b]?.status ?? "Unknown";
    return (pri[sa] ?? 9) - (pri[sb] ?? 9);
  });

  const shipmentOptions = sortedIds.map((id) => ({
    id,
    status: shipMap[id]?.status ?? "Unknown",
    dateKey: shipMap[id]?.dateKey ?? "",
  }));

  const rows = computeReconRows({
    shippedRows,
    rcMap,
    riMap,
    shipMap,
    filterShipmentStatus: filters.shipmentStatus,
    filterShipmentId: filters.shipmentId,
  });

  const overlay = await buildActionOverlay();

  return { rows, overlay, shipmentOptions };
}

export async function getShipmentActionOverlay(): Promise<
  Record<string, ActionCacheEntry>
> {
  return buildActionOverlay();
}

export async function saveShipmentReconCaseAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = shipmentReconCaseActionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const d = parsed.data;
  const issueDate = parseOptionalDate(d.issue_date) ?? new Date();
  const raisedDate = ["raised", "approved", "partial"].includes(d.status)
    ? new Date()
    : undefined;

  return createCase({
    msku: d.msku,
    asin: emptyToNull(d.asin),
    fnsku: emptyToNull(d.fnsku),
    title: emptyToNull(d.title),
    reconType: ReconType.SHIPMENT,
    shipmentId: d.shipment_id,
    orderId: null,
    referenceId: emptyToNull(d.case_id ?? undefined),
    caseReason: d.case_reason,
    unitsClaimed: d.units_claimed,
    unitsApproved: 0,
    amountClaimed: parseOptionalAmount(d.amount_claimed),
    amountApproved: null,
    currency: "USD",
    status: legacyCaseStatusToPrisma(d.status),
    issueDate,
    raisedDate,
    resolvedDate: undefined,
    notes: emptyToNull(d.notes),
    store: null,
  });
}

export async function saveShipmentReconAdjustmentAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = shipmentReconAdjActionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const d = parsed.data;
  return createAdjustment({
    msku: d.msku,
    asin: emptyToNull(d.asin),
    fnsku: emptyToNull(d.fnsku),
    title: emptyToNull(d.title),
    reconType: ReconType.SHIPMENT,
    shipmentId: d.shipment_id,
    orderId: null,
    referenceId: d.adj_type,
    adjType: AdjType.QUANTITY,
    qtyBefore: d.qty_before,
    qtyAdjusted: d.qty_adjusted,
    reason: d.reason,
    verifiedBy: emptyToNull(d.verified_by),
    sourceDoc: null,
    notes: emptyToNull(d.notes),
    adjDate: parseOptionalDate(d.adj_date) ?? new Date(),
    store: null,
    caseId: null,
  });
}

export async function saveShipmentCaStandaloneCase(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = shipmentCaStandaloneCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const d = parsed.data;
  const body = {
    msku: d.msku,
    asin: emptyToNull(d.asin),
    fnsku: emptyToNull(d.fnsku),
    title: emptyToNull(d.title),
    reconType: legacyReconStringToEnum(d.recon_type) ?? ReconType.SHIPMENT,
    shipmentId: emptyToNull(d.shipment_id),
    orderId: emptyToNull(d.order_id),
    referenceId: emptyToNull(d.case_id ?? undefined),
    caseReason: emptyToNull(d.case_reason),
    unitsClaimed: d.units_claimed ?? 0,
    unitsApproved: d.units_approved ?? 0,
    amountClaimed: parseOptionalAmount(d.amount_claimed),
    amountApproved: parseOptionalAmount(d.amount_approved),
    currency: "USD",
    status: legacyCaseStatusToPrisma(d.status),
    issueDate: parseOptionalDate(d.issue_date),
    raisedDate: parseOptionalDate(d.raised_date),
    resolvedDate: parseOptionalDate(d.resolved_date),
    notes: emptyToNull(d.notes),
    store: null,
  };
  if (d.id) {
    const res = await updateCase(d.id, body);
    return res.ok ? { ok: true, data: { id: d.id } } : res;
  }
  return createCase(body);
}

export async function saveShipmentCaStandaloneAdjustment(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = shipmentCaStandaloneAdjustmentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const d = parsed.data;
  const body = {
    msku: d.msku,
    asin: emptyToNull(d.asin),
    fnsku: emptyToNull(d.fnsku),
    title: emptyToNull(d.title),
    reconType: legacyReconStringToEnum(d.recon_type) ?? ReconType.SHIPMENT,
    shipmentId: emptyToNull(d.shipment_id),
    orderId: null,
    referenceId: d.adj_type,
    adjType: AdjType.QUANTITY,
    qtyBefore: d.qty_before,
    qtyAdjusted: d.qty_adjusted,
    reason: d.reason,
    verifiedBy: emptyToNull(d.verified_by),
    sourceDoc: emptyToNull(d.source_doc),
    notes: emptyToNull(d.notes),
    adjDate: parseOptionalDate(d.adj_date) ?? new Date(),
    store: null,
    caseId: null,
  };
  if (d.id) {
    const res = await updateAdjustment(d.id, body);
    return res.ok ? { ok: true, data: { id: d.id } } : res;
  }
  return createAdjustment(body);
}

export async function listShipmentCaCases(filters: {
  reconLegacy?: string;
  statusLegacy?: string;
  search?: string;
}): Promise<CaseTrackerRow[]> {
  const andClause: Prisma.CaseTrackerWhereInput[] = [{ deletedAt: null }];
  if (filters.reconLegacy) {
    const rt = legacyReconStringToEnum(filters.reconLegacy);
    if (rt) andClause.push({ reconType: rt });
  }
  if (filters.statusLegacy) {
    andClause.push({
      status: legacyCaseStatusToPrisma(filters.statusLegacy),
    });
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    andClause.push({
      OR: [
        { msku: { contains: q, mode: "insensitive" } },
        { asin: { contains: q, mode: "insensitive" } },
        { fnsku: { contains: q, mode: "insensitive" } },
        { shipmentId: { contains: q, mode: "insensitive" } },
        { referenceId: { contains: q, mode: "insensitive" } },
        { orderId: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const rows = await prisma.caseTracker.findMany({
    where: { AND: andClause },
    orderBy: [{ raisedDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(serializeCaseTrackerRow);
}

export async function listShipmentCaAdjustments(filters: {
  reconLegacy?: string;
  adjLegacy?: string;
  search?: string;
}): Promise<ManualAdjustmentRow[]> {
  const andClause: Prisma.ManualAdjustmentWhereInput[] = [
    { deletedAt: null },
  ];
  if (filters.reconLegacy) {
    const rt = legacyReconStringToEnum(filters.reconLegacy);
    if (rt) andClause.push({ reconType: rt });
  }
  if (filters.adjLegacy?.trim()) {
    andClause.push({ referenceId: filters.adjLegacy.trim() });
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    andClause.push({
      OR: [
        { msku: { contains: q, mode: "insensitive" } },
        { asin: { contains: q, mode: "insensitive" } },
        { fnsku: { contains: q, mode: "insensitive" } },
        { shipmentId: { contains: q, mode: "insensitive" } },
        { referenceId: { contains: q, mode: "insensitive" } },
        { orderId: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return prisma.manualAdjustment.findMany({
    where: { AND: andClause },
    orderBy: [{ adjDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function deleteShipmentCaCase(id: string): Promise<MutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  return deleteCase(id);
}

export async function deleteShipmentCaAdjustment(
  id: string,
): Promise<MutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  return deleteAdjustment(id);
}
