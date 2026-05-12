"use server";

import { revalidatePath } from "next/cache";
import { Prisma, ReconType, CaseStatus, RemovalReceiptStatus, WareHouseStatus, FinalStatus } from "@prisma/client";

import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import { summaryStats } from "@/lib/removal-reconciliation/aggregate";
import { computeRemovalRow } from "@/lib/removal-reconciliation/formula";
import { buildCaseMap, buildReceiptMap, buildShipmentMap } from "@/lib/removal-reconciliation/matching";
import type {
  RemovalReceiptRow,
  RemovalReconRow,
  RemovalReconStats,
} from "@/lib/removal-reconciliation/types";
import {
  postActionSchema,
  receiveActionSchema,
  reimbursementSchema,
} from "@/lib/validations/removal-reconciliation";

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type RemovalReconciliationPayload = {
  rows: RemovalReconRow[];
  receiptRows: RemovalReceiptRow[];
  stats: RemovalReconStats;
};

function revalidateAll() {
  revalidatePath("/removal-reconciliation");
  revalidatePath("/cases-adjustments");
}

function fmtDateIso(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function statusKeyToEnum(s: string): RemovalReceiptStatus {
  const v = s.toUpperCase();
  if (v in RemovalReceiptStatus) return v as RemovalReceiptStatus;
  return RemovalReceiptStatus.AWAITING;
}

function whStatusToEnum(s: string | null): WareHouseStatus {
  if (!s) return WareHouseStatus.PENDING;
  const map: Record<string, WareHouseStatus> = {
    "Pending": WareHouseStatus.PENDING,
    "Received - Ready": WareHouseStatus.RECEIVED,
    "Received - Pending Check": WareHouseStatus.PROCESSED,
    "Damaged - Case Needed": WareHouseStatus.PROCESSED,
    "Incorrect Item": WareHouseStatus.PROCESSED,
    "Disposed": WareHouseStatus.COMPLETE,
  };
  return map[s] ?? WareHouseStatus.PENDING;
}

function conditionToStatus(received: number, expected: number, unsellable: number): RemovalReceiptStatus {
  if (received === 0 && expected > 0) return RemovalReceiptStatus.MISSING;
  if (unsellable > 0 && received - unsellable === 0) return RemovalReceiptStatus.DAMAGED;
  if (received < expected) return RemovalReceiptStatus.PARTIAL;
  if (received >= expected && expected > 0) return RemovalReceiptStatus.COMPLETE;
  return RemovalReceiptStatus.AWAITING;
}

export type RemovalReconFilters = {
  orderStatus?: string;
  disposition?: string;
  orderType?: string;
  from?: string | null;
  to?: string | null;
  search?: string;
  receiptStatus?: string;
};

export async function getRemovalReconData(
  filters: RemovalReconFilters = {},
): Promise<RemovalReconciliationPayload> {
  const where: Prisma.FbaRemovalWhereInput = { deletedAt: null };
  if (filters.orderStatus && filters.orderStatus !== "all" && filters.orderStatus !== "") {
    where.orderStatus = filters.orderStatus;
  }
  if (filters.from) {
    where.requestDate = { ...(where.requestDate as object | undefined), gte: new Date(filters.from) };
  }
  if (filters.to) {
    where.requestDate = { ...(where.requestDate as object | undefined), lte: new Date(filters.to + "T23:59:59") };
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { msku: { contains: q, mode: "insensitive" } },
      { fnsku: { contains: q, mode: "insensitive" } },
      { orderId: { contains: q, mode: "insensitive" } },
    ];
  }

  const [removals, shipments, receipts, cases] = await Promise.all([
    prisma.fbaRemoval.findMany({
      where,
      select: {
        id: true,
        orderId: true,
        fnsku: true,
        msku: true,
        requestDate: true,
        lastUpdated: true,
        orderStatus: true,
        orderType: true,
        orderSource: true,
        disposition: true,
        quantity: true,
        cancelledQty: true,
        disposedQty: true,
        inProcessQty: true,
        removalFee: true,
        currency: true,
      },
    }),
    prisma.removalShipment.findMany({
      where: { deletedAt: null },
      select: {
        orderId: true,
        fnsku: true,
        shippedQty: true,
        carrier: true,
        trackingNumber: true,
        shipmentDate: true,
      },
    }),
    prisma.removalReceipt.findMany({
      where: { deletedAt: null },
      select: {
        orderId: true,
        fnsku: true,
        receivedQty: true,
        sellableQty: true,
        unsellableQty: true,
        missingQty: true,
        reimbQty: true,
        reimbAmount: true,
        postAction: true,
        finalStatus: true,
        wrongItemReceived: true,
      },
    }),
    prisma.caseTracker.findMany({
      where: { deletedAt: null, reconType: ReconType.REMOVAL },
      select: {
        orderId: true,
        fnsku: true,
        unitsClaimed: true,
        unitsApproved: true,
        amountApproved: true,
        status: true,
        referenceId: true,
      },
    }),
  ]);

  const shipmentMap = buildShipmentMap(shipments);
  const receiptMap = buildReceiptMap(receipts);
  const caseMap = buildCaseMap(cases);

  let rows: RemovalReconRow[] = removals.map((removal) =>
    computeRemovalRow({ removal, shipmentMap, receiptMap, caseMap }),
  );

  if (filters.disposition && filters.disposition !== "all" && filters.disposition !== "") {
    const d = filters.disposition.toLowerCase();
    rows = rows.filter((r) => r.disposition.toLowerCase() === d);
  }
  if (filters.orderType && filters.orderType !== "all" && filters.orderType !== "") {
    const t = filters.orderType.toLowerCase();
    rows = rows.filter((r) => r.orderType.toLowerCase() === t);
  }
  if (
    filters.receiptStatus &&
    filters.receiptStatus !== "all" &&
    filters.receiptStatus !== ""
  ) {
    const rs = filters.receiptStatus.toUpperCase();
    if (rs === "HASCASE") {
      rows = rows.filter((r) => r.caseCount > 0);
    } else {
      rows = rows.filter((r) => r.receiptStatus === rs);
    }
  }

  const stats = summaryStats(rows);

  const receiptRows = await listRemovalReceipts();

  return { rows, receiptRows, stats };
}

export async function listRemovalReceipts(): Promise<RemovalReceiptRow[]> {
  const rows = await prisma.removalReceipt.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  return rows.map((r) => ({
    id: r.id,
    orderId: r.orderId ?? "",
    fnsku: r.fnsku ?? "",
    msku: r.msku ?? "",
    trackingNumber: r.trackingNumber ?? "",
    carrier: r.carrier ?? "",
    expectedQty: r.expectedQty,
    receivedDate: fmtDateIso(r.receivedDate),
    receivedQty: r.receivedQty,
    sellableQty: r.sellableQty,
    unsellableQty: r.unsellableQty,
    missingQty: r.missingQty,
    conditionReceived: r.conditionReceived ?? "",
    notes: r.notes ?? "",
    receivedBy: r.receivedBy ?? "",
    status: String(r.status),
    warehouseComment: r.warehouseComment ?? "",
    transferTo: r.transferTo ?? "",
    whStatus: String(r.whStatus),
    wrongItemReceived: r.wrongItemReceived,
    wrongItemNotes: r.wrongItemNotes ?? "",
    sellerStatus: r.sellerStatus ?? "",
    sellerComments: r.sellerComments ?? "",
    warehouseBilled: r.warehouseBilled,
    billedDate: fmtDateIso(r.billedDate),
    billedAmount: r.billedAmount ? Number(r.billedAmount.toString()) : 0,
    reimbQty: r.reimbQty,
    reimbAmount: r.reimbAmount ? Number(r.reimbAmount.toString()) : 0,
    postAction: r.postAction ?? "",
    actionRemarks: r.actionRemarks ?? "",
    actionDate: fmtDateIso(r.actionDate),
    finalStatus: String(r.finalStatus),
    caseId: r.caseId ?? "",
    caseTrackerId: r.caseTrackerId,
  }));
}

export async function saveReceiveAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = receiveActionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const missingQty = Math.max(0, v.expectedQty - v.receivedQty);
    const status = conditionToStatus(v.receivedQty, v.expectedQty, v.unsellableQty);

    const result = await prisma.$transaction(async (tx) => {
      // Upsert receipt by (orderId, fnsku, trackingNumber)
      const existing = await tx.removalReceipt.findFirst({
        where: {
          orderId: v.orderId,
          fnsku: v.fnsku,
          trackingNumber: v.trackingNumber ?? null,
          deletedAt: null,
        },
      });

      const receivedDate = v.receivedDate ? new Date(v.receivedDate) : null;

      let receipt;
      if (existing) {
        receipt = await tx.removalReceipt.update({
          where: { id: existing.id },
          data: {
            msku: v.msku,
            carrier: v.carrier,
            expectedQty: v.expectedQty,
            receivedDate,
            receivedQty: v.receivedQty,
            sellableQty: v.sellableQty,
            unsellableQty: v.unsellableQty,
            missingQty,
            conditionReceived: v.conditionReceived,
            notes: v.notes,
            receivedBy: v.receivedBy,
            status,
            warehouseComment: v.warehouseComment,
            transferTo: v.transferTo,
            whStatus: whStatusToEnum(v.whStatus),
            wrongItemReceived: v.wrongItemReceived,
            wrongItemNotes: v.wrongItemNotes,
            invoiceNumber: v.invoiceNumber,
            reshippedQty: v.reshippedQty,
            itemTitle: v.itemTitle,
            binLocation: v.binLocation,
          },
        });
      } else {
        receipt = await tx.removalReceipt.create({
          data: {
            orderId: v.orderId,
            fnsku: v.fnsku,
            msku: v.msku,
            trackingNumber: v.trackingNumber,
            carrier: v.carrier,
            expectedQty: v.expectedQty,
            receivedDate,
            receivedQty: v.receivedQty,
            sellableQty: v.sellableQty,
            unsellableQty: v.unsellableQty,
            missingQty,
            conditionReceived: v.conditionReceived,
            notes: v.notes,
            receivedBy: v.receivedBy,
            status,
            warehouseComment: v.warehouseComment,
            transferTo: v.transferTo,
            whStatus: whStatusToEnum(v.whStatus),
            wrongItemReceived: v.wrongItemReceived,
            wrongItemNotes: v.wrongItemNotes,
            invoiceNumber: v.invoiceNumber,
            reshippedQty: v.reshippedQty,
            itemTitle: v.itemTitle,
            binLocation: v.binLocation,
          },
        });
      }

      // Optional case creation
      if (v.raiseCase && v.unitsClaimed > 0) {
        const today = new Date();
        const issueDate = v.issueDate ? new Date(v.issueDate) : receivedDate ?? today;
        const newCase = await tx.caseTracker.create({
          data: {
            msku: v.msku,
            fnsku: v.fnsku,
            reconType: ReconType.REMOVAL,
            orderId: v.orderId,
            caseReason: v.caseReason ?? "Removal Issue",
            unitsClaimed: v.unitsClaimed,
            unitsApproved: 0,
            amountClaimed: new Prisma.Decimal(v.amountClaimed),
            amountApproved: new Prisma.Decimal(0),
            currency: "USD",
            status: CaseStatus.IN_PROGRESS,
            issueDate,
            raisedDate: today,
            notes: v.caseNotes,
          },
        });

        await tx.removalReceipt.update({
          where: { id: receipt.id },
          data: {
            caseTrackerId: newCase.id,
            caseRaisedAt: today,
            caseType: v.caseReason,
          },
        });
      }

      return receipt;
    });

    revalidateAll();
    return { ok: true, data: { id: result.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function saveReimbursement(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = reimbursementSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    let receipt;
    if (v.receiptId) {
      receipt = await prisma.removalReceipt.update({
        where: { id: v.receiptId },
        data: {
          reimbQty: v.reimbQty,
          reimbAmount: new Prisma.Decimal(v.reimbAmount),
          status: RemovalReceiptStatus.REIMBURSED,
          finalStatus: FinalStatus.RESOLVED,
          postAction: "Reimbursed",
          notes: v.notes ?? undefined,
        },
      });
    } else {
      const existing = await prisma.removalReceipt.findFirst({
        where: {
          orderId: v.orderId,
          fnsku: v.fnsku,
          deletedAt: null,
        },
        orderBy: { receivedQty: "desc" },
      });
      if (existing) {
        receipt = await prisma.removalReceipt.update({
          where: { id: existing.id },
          data: {
            reimbQty: v.reimbQty,
            reimbAmount: new Prisma.Decimal(v.reimbAmount),
            status: RemovalReceiptStatus.REIMBURSED,
            finalStatus: FinalStatus.RESOLVED,
            postAction: "Reimbursed",
            notes: v.notes ?? existing.notes,
          },
        });
      } else {
        receipt = await prisma.removalReceipt.create({
          data: {
            orderId: v.orderId,
            fnsku: v.fnsku,
            reimbQty: v.reimbQty,
            reimbAmount: new Prisma.Decimal(v.reimbAmount),
            status: RemovalReceiptStatus.REIMBURSED,
            finalStatus: FinalStatus.RESOLVED,
            postAction: "Reimbursed",
            notes: v.notes,
          },
        });
      }
    }
    revalidateAll();
    return { ok: true, data: { id: receipt.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function savePostAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = postActionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const isReimb = v.postAction === "Reimbursed";
  try {
    const receipt = await prisma.removalReceipt.update({
      where: { id: v.receiptId },
      data: {
        postAction: v.postAction,
        actionRemarks: v.actionRemarks,
        actionDate: v.actionDate ? new Date(v.actionDate) : null,
        transferTo: v.transferTo,
        sellerStatus: v.sellerStatus,
        sellerComments: v.sellerComments,
        warehouseBilled: v.warehouseBilled,
        billedDate: v.billedDate ? new Date(v.billedDate) : null,
        billedAmount: new Prisma.Decimal(v.billedAmount),
        invoiceNumber: v.invoiceNumber,
        reshippedQty: v.reshippedQty,
        ...(isReimb
          ? {
              reimbQty: v.reimbQty,
              reimbAmount: new Prisma.Decimal(v.reimbAmount),
              status: RemovalReceiptStatus.REIMBURSED,
              finalStatus: FinalStatus.RESOLVED,
            }
          : {
              finalStatus: FinalStatus.RESOLVED,
            }),
      },
    });
    revalidateAll();
    return { ok: true, data: { id: receipt.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function unlockRemovalRow(
  orderId: string,
  fnsku: string,
): Promise<MutationResult> {
  if (!orderId.trim()) return { ok: false, error: "Order ID required" };
  try {
    const existing = await prisma.removalReceipt.findFirst({
      where: {
        orderId: orderId.trim(),
        ...(fnsku.trim() ? { fnsku: fnsku.trim() } : {}),
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!existing) {
      revalidateAll();
      return { ok: true };
    }
    await prisma.removalReceipt.update({
      where: { id: existing.id },
      data: {
        receivedQty: 0,
        sellableQty: 0,
        unsellableQty: 0,
        missingQty: 0,
        status: RemovalReceiptStatus.AWAITING,
        reimbQty: 0,
        reimbAmount: new Prisma.Decimal(0),
        postAction: null,
        actionRemarks: null,
        finalStatus: FinalStatus.OPEN,
      },
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function unlockReceiptRow(receiptId: string): Promise<MutationResult> {
  try {
    await prisma.removalReceipt.update({
      where: { id: receiptId },
      data: {
        postAction: null,
        actionRemarks: null,
        actionDate: null,
        finalStatus: FinalStatus.OPEN,
        sellerStatus: "Pending Action",
        reimbQty: 0,
        reimbAmount: new Prisma.Decimal(0),
      },
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function deleteReceipt(receiptId: string): Promise<MutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  try {
    await prisma.removalReceipt.update({
      where: { id: receiptId },
      data: { deletedAt: new Date() },
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ============================================================
// Attachments (Task L)
// ============================================================

const ATTACH_BASE_DIR = "public/uploads/removal-receipts";
const ATTACH_MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
const ATTACH_ALLOWED_EXT = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".csv",
  ".xlsx",
  ".xls",
  ".txt",
]);

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function safeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
}

type AttachmentEntry = {
  url: string;
  filename: string;
  size: number;
  uploadedAt: string;
};

function parseAttachments(raw: unknown): AttachmentEntry[] {
  if (!raw) return [];
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((v): AttachmentEntry | null => {
      if (typeof v === "string") {
        return { url: v, filename: v.split("/").pop() ?? v, size: 0, uploadedAt: "" };
      }
      if (v && typeof v === "object" && "url" in v) {
        const o = v as Record<string, unknown>;
        return {
          url: String(o.url),
          filename: String(o.filename ?? ""),
          size: Number(o.size ?? 0) || 0,
          uploadedAt: String(o.uploadedAt ?? ""),
        };
      }
      return null;
    })
    .filter((x): x is AttachmentEntry => x !== null);
}

export async function uploadRemovalReceiptAttachment(
  formData: FormData,
): Promise<MutationResult<{ attachments: AttachmentEntry[] }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }

  const receiptId = String(formData.get("receiptId") ?? "").trim();
  if (!receiptId) return { ok: false, error: "receiptId required" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file uploaded." };
  }
  if (file.size === 0) {
    return { ok: false, error: "File is empty." };
  }
  if (file.size > ATTACH_MAX_BYTES) {
    return { ok: false, error: "File too large (max 25 MB)." };
  }
  const ext = getExt(file.name);
  if (!ATTACH_ALLOWED_EXT.has(ext)) {
    return { ok: false, error: `File type ${ext || "<unknown>"} not allowed.` };
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const dirPath = path.join(process.cwd(), ATTACH_BASE_DIR, safeSegment(receiptId));
  await fs.mkdir(dirPath, { recursive: true });

  const stem = safeSegment(file.name.slice(0, file.name.length - ext.length) || "file");
  const stamp = Date.now().toString(36);
  const filename = `${stamp}-${stem}${ext}`;
  const absPath = path.join(dirPath, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absPath, buf);

  const publicUrl = `/uploads/removal-receipts/${safeSegment(receiptId)}/${filename}`;

  try {
    const existing = await prisma.removalReceipt.findUnique({
      where: { id: receiptId },
      select: { id: true, attachmentUrls: true },
    });
    if (!existing) {
      // Clean up the orphan file before failing.
      try {
        await fs.unlink(absPath);
      } catch {
        /* ignore */
      }
      return { ok: false, error: "Receipt not found." };
    }
    const next = parseAttachments(existing.attachmentUrls);
    const entry: AttachmentEntry = {
      url: publicUrl,
      filename: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
    next.push(entry);
    await prisma.removalReceipt.update({
      where: { id: receiptId },
      data: { attachmentUrls: next as unknown as Prisma.InputJsonValue },
    });
    revalidateAll();
    return { ok: true, data: { attachments: next } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

export async function deleteRemovalReceiptAttachment(
  receiptId: string,
  url: string,
): Promise<MutationResult<{ attachments: AttachmentEntry[] }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  if (!receiptId.trim() || !url.trim()) {
    return { ok: false, error: "receiptId and url required." };
  }
  try {
    const existing = await prisma.removalReceipt.findUnique({
      where: { id: receiptId },
      select: { id: true, attachmentUrls: true },
    });
    if (!existing) return { ok: false, error: "Receipt not found." };
    const list = parseAttachments(existing.attachmentUrls);
    const filtered = list.filter((a) => a.url !== url);
    if (filtered.length === list.length) {
      return { ok: false, error: "Attachment not found." };
    }
    await prisma.removalReceipt.update({
      where: { id: receiptId },
      data: { attachmentUrls: filtered as unknown as Prisma.InputJsonValue },
    });

    // Best-effort file unlink. Only delete files inside the receipt's directory.
    if (url.startsWith("/uploads/removal-receipts/")) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const rel = url.replace(/^\//, "");
      const abs = path.join(process.cwd(), "public", rel);
      try {
        await fs.unlink(abs);
      } catch {
        /* ignore */
      }
    }
    revalidateAll();
    return { ok: true, data: { attachments: filtered } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}

export async function listRemovalReceiptAttachments(
  receiptId: string,
): Promise<AttachmentEntry[]> {
  const row = await prisma.removalReceipt.findUnique({
    where: { id: receiptId },
    select: { attachmentUrls: true },
  });
  return parseAttachments(row?.attachmentUrls);
}
