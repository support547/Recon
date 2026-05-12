"use server";

import { parse } from "csv-parse/sync";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  REPORT_TYPE_VALUES,
  type ReportTypeValue,
  type UploadFileResult,
  type UploadHistoryRow,
  type UploadMutationResult,
  type UploadSummaryRow,
} from "@/lib/upload-report-types";
import { requireAuth } from "@/actions/auth";

const REVALIDATE_PATHS = [
  "/upload",
  "/data-explorer",
  "/shipment-reconciliation",
  "/removal-reconciliation",
  "/returns-reconciliation",
  "/replacement-reconciliation",
  "/fc-transfer-reconciliation",
  "/full-inventory-reconciliation",
  "/grade-resell",
  "/gnr-reconciliation",
  "/cases-adjustments",
  "/",
] as const;

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

export async function getUploadHistory(
  reportType?: string,
): Promise<UploadHistoryRow[]> {
  return prisma.uploadedFile.findMany({
    where: reportType ? { reportType } : undefined,
    orderBy: { uploadedAt: "desc" },
    take: 50,
    select: {
      id: true,
      reportType: true,
      filename: true,
      rowCount: true,
      rowsSkipped: true,
      isLocked: true,
      uploadedAt: true,
    },
  });
}

export async function getUploadSummaryByType(): Promise<UploadSummaryRow[]> {
  const [
    grouped,
    latestPerType,
    shippedAgg,
    salesAgg,
    receiptsAgg,
    returnsAgg,
    reimbAgg,
    fcAgg,
    replAgg,
    gnrAgg,
    removalsAgg,
    remShipAgg,
    shipStatusAgg,
    fbaSummAgg,
  ] = await Promise.all([
    prisma.uploadedFile.groupBy({
      by: ["reportType"],
      _count: { _all: true },
      _sum: { rowCount: true },
      _max: { uploadedAt: true },
    }),
    prisma.uploadedFile.findMany({
      distinct: ["reportType"],
      orderBy: { uploadedAt: "desc" },
      select: { reportType: true, rowCount: true },
    }),
    prisma.shippedToFba.aggregate({ _max: { shipDate: true } }),
    prisma.salesData.aggregate({ _max: { saleDate: true } }),
    prisma.fbaReceipt.aggregate({ _max: { receiptDate: true } }),
    prisma.customerReturn.aggregate({ _max: { returnDate: true } }),
    prisma.reimbursement.aggregate({ _max: { approvalDate: true } }),
    prisma.fcTransfer.aggregate({ _max: { transferDate: true } }),
    prisma.replacement.aggregate({ _max: { shipmentDate: true } }),
    prisma.gnrReport.aggregate({ _max: { reportDate: true } }),
    prisma.fbaRemoval.aggregate({ _max: { requestDate: true } }),
    prisma.removalShipment.aggregate({ _max: { shipmentDate: true } }),
    prisma.shipmentStatus.aggregate({ _max: { lastUpdated: true } }),
    prisma.fbaSummary.aggregate({ _max: { summaryDate: true } }),
  ]);

  const latestMap = new Map(
    latestPerType.map((r) => [r.reportType, r.rowCount]),
  );
  const groupedMap = new Map(grouped.map((g) => [g.reportType, g]));

  const latestDataDates: Record<string, Date | null> = {
    shipped_to_fba: shippedAgg._max.shipDate,
    sales_data: salesAgg._max.saleDate,
    fba_receipts: receiptsAgg._max.receiptDate,
    customer_returns: returnsAgg._max.returnDate,
    reimbursements: reimbAgg._max.approvalDate,
    fc_transfers: fcAgg._max.transferDate,
    replacements: replAgg._max.shipmentDate,
    gnr_report: gnrAgg._max.reportDate,
    fba_removals: removalsAgg._max.requestDate,
    removal_shipments: remShipAgg._max.shipmentDate,
    shipment_status: shipStatusAgg._max.lastUpdated,
    fba_summary: fbaSummAgg._max.summaryDate,
    payment_repository: null,
    adjustments: null,
  };

  return REPORT_TYPE_VALUES.map((rt) => {
    const g = groupedMap.get(rt);
    return {
      reportType: rt,
      uploadCount: g?._count._all ?? 0,
      totalRows: g?._sum.rowCount ?? 0,
      lastUpload: g?._max.uploadedAt ?? null,
      lastRowCount: latestMap.get(rt) ?? 0,
      latestInFile: latestDataDates[rt] ?? null,
    };
  });
}


export async function setUploadLocked(
  id: string,
  isLocked: boolean,
): Promise<UploadMutationResult> {
  try {
    await prisma.uploadedFile.update({
      where: { id },
      data: { isLocked },
    });
    revalidatePath("/upload");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not update lock state." };
  }
}

/** Deletes the upload log row and all fact rows stamped with the same `uploadedAt` for that batch. */
export async function deleteUploadBatch(id: string): Promise<UploadMutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const uf = await prisma.uploadedFile.findUnique({ where: { id } });
  if (!uf) return { ok: false, error: "Upload not found." };
  if (uf.isLocked) {
    return { ok: false, error: "This upload is locked and cannot be deleted." };
  }

  const at = uf.uploadedAt;
  const rt = uf.reportType as ReportTypeValue;

  try {
    await prisma.$transaction(async (tx) => {
      switch (rt) {
        case "shipped_to_fba":
          await tx.shippedToFba.deleteMany({ where: { uploadedAt: at } });
          break;
        case "sales_data":
          await tx.salesData.deleteMany({ where: { uploadedAt: at } });
          break;
        case "fba_receipts":
          await tx.fbaReceipt.deleteMany({ where: { uploadedAt: at } });
          break;
        case "customer_returns":
          await tx.customerReturn.deleteMany({ where: { uploadedAt: at } });
          break;
        case "reimbursements":
          await tx.reimbursement.deleteMany({ where: { uploadedAt: at } });
          break;
        case "fba_removals":
          await tx.fbaRemoval.deleteMany({ where: { uploadedAt: at } });
          break;
        case "fc_transfers":
          await tx.fcTransfer.deleteMany({ where: { uploadedAt: at } });
          break;
        case "shipment_status":
          await tx.shipmentStatus.deleteMany({ where: { uploadedAt: at } });
          break;
        case "fba_summary":
          await tx.fbaSummary.deleteMany({ where: { uploadedAt: at } });
          break;
        case "replacements":
          await tx.replacement.deleteMany({ where: { uploadedAt: at } });
          break;
        case "adjustments":
          await tx.adjustment.deleteMany({ where: { uploadedAt: at } });
          break;
        case "gnr_report":
          await tx.gnrReport.deleteMany({ where: { uploadedAt: at } });
          break;
        case "payment_repository":
          await tx.paymentRepository.deleteMany({ where: { uploadedAt: at } });
          break;
        case "removal_shipments":
          await tx.removalShipment.deleteMany({ where: { uploadedAt: at } });
          break;
        case "settlement_report":
          await tx.settlementReport.deleteMany({ where: { uploadedAt: at } });
          break;
        default:
          throw new Error(`Unknown report type: ${rt}`);
      }
      await tx.uploadedFile.delete({ where: { id } });
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || "Delete failed." };
  }
}

const MAX_BYTES = 50 * 1024 * 1024;

export async function uploadFile(formData: FormData): Promise<UploadFileResult> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const reportType = String(formData.get("report_type") ?? "").trim();
  const file = formData.get("file");

  if (!REPORT_TYPE_VALUES.includes(reportType as ReportTypeValue)) {
    return { ok: false, error: "Please choose a valid report type." };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "No file was uploaded." };
  }
  if (file.size === 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File is too large (max 50 MB)." };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let rows: string[][];
  try {
    rows = parseSpreadsheet(file.name, buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Could not read the file: ${msg}`,
    };
  }

  if (!rows.length) {
    return { ok: false, error: "No rows found in this file." };
  }

  try {
    const batchAt = new Date();

    const { totalRows, rowsInserted, rowsSkipped } = await prisma.$transaction(
      async (tx) => {
        const { totalRows: tr, rowsInserted: ins, rowsSkipped: sk } =
          await (async () => {
            switch (reportType as ReportTypeValue) {
              case "shipped_to_fba":
                return processShipped(tx, rows, batchAt);
              case "sales_data":
                return processSales(tx, rows, batchAt);
              case "fba_receipts":
                return processReceipts(tx, rows, batchAt);
              case "customer_returns":
                return processReturns(tx, rows, batchAt);
              case "reimbursements":
                return processReimbursements(tx, rows, batchAt);
              case "fba_removals":
                return processRemovals(tx, rows, batchAt);
              case "fc_transfers":
                return processFcTransfers(tx, rows, batchAt);
              case "shipment_status":
                return processShipmentStatus(tx, rows, batchAt);
              case "fba_summary":
                return processFbaSummary(tx, rows, batchAt);
              case "replacements":
                return processReplacements(tx, rows, batchAt);
              case "adjustments":
                return processAdjustments(tx, rows, batchAt);
              case "gnr_report":
                return processGnr(tx, rows, batchAt);
              case "payment_repository":
                return processPaymentRepository(tx, rows, batchAt);
              case "removal_shipments":
                return processRemovalShipments(tx, rows, batchAt);
              case "settlement_report":
                return processSettlementReport(tx, rows, batchAt);
              default:
                throw new Error("Unsupported report type.");
            }
          })();

        await tx.uploadedFile.create({
          data: {
            reportType,
            filename: file.name,
            rowCount: ins,
            rowsSkipped: sk,
            uploadedAt: batchAt,
          },
        });

        return { totalRows: tr, rowsInserted: ins, rowsSkipped: sk };
      },
      { maxWait: 10_000, timeout: 300_000 },
    );

    revalidateAll();

    // Fire-and-forget: recompute ReconciliationSummary so dashboard / KPIs reflect new data.
    void import("@/actions/reconciliation-refresh")
      .then((m) => m.refreshReconciliationSummary())
      .catch((err) => {
        console.warn(
          "[upload] reconciliation refresh after upload failed:",
          err instanceof Error ? err.message : err,
        );
      });

    return {
      ok: true,
      rowsInserted,
      rowsSkipped,
      totalInFile: totalRows,
      filename: file.name,
      reportType,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[upload]", reportType, msg);
    return {
      ok: false,
      error:
        msg.length > 280
          ? `${msg.slice(0, 280)}…`
          : msg || "Upload failed. Check the file format and try again.",
    };
  }
}

/* ─── Parsing ─── */

function parseSpreadsheet(filename: string, buf: Buffer): string[][] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = buf.toString("utf8").replace(/^\uFEFF/, "");
    const parsed = parse(text, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    }) as string[][];
    return parsed.map((row) =>
      row.map((c) => String(c ?? "").replace(/^"|"$/g, "").trim()),
    );
  }
  if (lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    return buf
      .toString("utf8")
      .split("\n")
      .map((line) =>
        line
          .split("\t")
          .map((c) =>
            c.trim().replace(/"/g, "").replace(/'/g, ""),
          ),
      )
      .filter((l) => l.length > 1);
  }
  if (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xlsm") ||
    lower.endsWith(".xls")
  ) {
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    }) as unknown[][];
    return raw.map((row) =>
      (row ?? []).map((c) => String(c ?? "").replace(/"/g, "").trim()),
    );
  }
  throw new Error("Use .csv, .tsv, .txt, or .xlsx format.");
}

function toNum(val: unknown): number {
  const n = parseFloat(String(val ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toDate(val: unknown): Date | null {
  if (val == null || val === "") return null;
  if (val instanceof Date) return val;
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(`${str}T00:00:00.000Z`);
  }
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    return new Date(
      `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}T00:00:00.000Z`,
    );
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const mdy2 = str.match(/([A-Za-z]+ \d{1,2},?\s*\d{4})/);
  if (mdy2) {
    const d2 = new Date(mdy2[1]);
    if (!Number.isNaN(d2.getTime())) return d2;
  }
  return null;
}

function decMoney(val: unknown): Prisma.Decimal | null {
  if (val == null || val === "") return null;
  const n = parseFloat(
    String(val).replace(/,/g, "").replace(/[^0-9.-]/g, ""),
  );
  return Number.isFinite(n) ? new Prisma.Decimal(n) : null;
}

function rawDec(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return v;
  if (v instanceof Prisma.Decimal) return v.toString();
  try {
    return new Prisma.Decimal(v as string | number | Prisma.Decimal).toString();
  } catch {
    return null;
  }
}

type Tx = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

type ProcessOutcome = {
  totalRows: number;
  rowsInserted: number;
  rowsSkipped: number;
};

/* ─── Processors (legacy server.js behaviour) ─── */

async function processShipped(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const shipmentId = String(allRows[0]?.[1] ?? "").trim();
  const nameVal = String(allRows[1]?.[1] ?? "").trim();
  let shipDate: Date | null = null;
  const dateMatch = nameVal.match(/\((\d{1,2}\/\d{1,2}\/\d{4})/);
  if (dateMatch) {
    const parts = dateMatch[1].split("/");
    shipDate = new Date(
      `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}T00:00:00.000Z`,
    );
  }

  let headerIdx = -1;
  for (let i = 0; i < allRows.length; i++) {
    const c0 = String(allRows[i]?.[0] ?? "");
    if (c0.includes("Merchant SKU") || c0.includes("merchant-sku")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      'Not a valid Shipped to FBA report — missing "Merchant SKU" column.',
    );
  }

  const dataRows = allRows
    .slice(headerIdx + 1)
    .filter((r) => r[0] && String(r[0]).trim());

  const map: Record<
    string,
    { msku: string; title: string; asin: string; fnsku: string; qty: number }
  > = {};
  for (const row of dataRows) {
    const msku = String(row[0] ?? "").trim();
    const title = String(row[1] ?? "").trim();
    const asin = String(row[2] ?? "").trim();
    const fnsku = String(row[3] ?? "").trim();
    const qty = toNum(row[9]);
    if (!msku) continue;
    if (!map[msku]) map[msku] = { msku, title, asin, fnsku, qty: 0 };
    map[msku].qty += qty;
  }

  const entries = Object.values(map).filter((e) => e.msku && e.qty > 0);

  const priorRows = await tx.shippedToFba.findMany({
    where: shipmentId
      ? { shipmentId }
      : { shipmentId: null },
    select: { uploadedAt: true },
  });
  const priorTimes = Array.from(
    new Set(priorRows.map((r) => r.uploadedAt.getTime())),
  ).map((t) => new Date(t));

  await tx.shippedToFba.deleteMany({
    where: shipmentId ? { shipmentId } : { shipmentId: null },
  });

  if (priorTimes.length) {
    await tx.uploadedFile.deleteMany({
      where: {
        reportType: "shipped_to_fba",
        uploadedAt: { in: priorTimes },
        isLocked: false,
      },
    });
  }

  if (entries.length) {
    await tx.shippedToFba.createMany({
      data: entries.map((e) => ({
        msku: e.msku,
        title: e.title || null,
        asin: e.asin || null,
        fnsku: e.fnsku || null,
        shipDate,
        quantity: e.qty,
        shipmentId: shipmentId || null,
        uploadedAt: batchAt,
      })),
    });
  }

  return {
    totalRows: entries.length,
    rowsInserted: entries.length,
    rowsSkipped: 0,
  };
}

async function processSales(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/\ufeff/g, ""),
  );
  const ok =
    hdr.some(
      (c) =>
        c.includes("amazon order id") ||
        c.includes("order id"),
    ) &&
    hdr.some(
      (c) =>
        c.includes("merchant sku") ||
        c.includes("customer shipment"),
    );
  if (!ok) {
    throw new Error(
      'Not a valid Sales report — need columns like "Amazon Order Id" and "Merchant SKU".',
    );
  }

  type SaleRow = {
    msku: string;
    fnsku: string | null;
    asin: string | null;
    fc: string | null;
    quantity: number;
    orderId: string;
    currency: string;
    productAmount: Prisma.Decimal | null;
    shippingAmount: Prisma.Decimal | null;
    giftAmount: Prisma.Decimal | null;
    shipCity: string | null;
    shipState: string | null;
    shipPostalCode: string | null;
    saleDate: Date | null;
  };

  const dataRows = allRows.slice(1).filter((r) => r[1] && String(r[1]).trim());
  const rows = dataRows
    .map((row) => {
      const msku = String(row[1] ?? "").trim();
      const orderId = String(row[6] ?? "").trim();
      if (!msku || !orderId) return null;
      return {
        msku,
        fnsku: String(row[2] ?? "").trim() || null,
        asin: String(row[3] ?? "").trim() || null,
        fc: String(row[4] ?? "").trim() || null,
        quantity: toNum(row[5]),
        orderId,
        currency: String(row[7] ?? "USD").trim() || "USD",
        productAmount: decMoney(row[8]),
        shippingAmount: decMoney(row[9]),
        giftAmount: decMoney(row[10]),
        shipCity: String(row[11] ?? "").trim() || null,
        shipState: String(row[12] ?? "").trim() || null,
        shipPostalCode:
          String(row[13] ?? "")
            .replace(/[\r\n]/g, "")
            .trim() || null,
        saleDate: toDate(row[0]),
      };
    })
    .filter(Boolean) as SaleRow[];

  let ins = 0;
  let sk = 0;
  let bad = 0;
  for (const r of rows) {
    if (!r.saleDate) {
      bad += 1;
      continue;
    }
    const existed = await tx.salesData.findFirst({
      where: { orderId: r.orderId, saleDate: r.saleDate },
    });
    await tx.$executeRaw`
      INSERT INTO "sales_data" (
        "id", "msku", "fnsku", "asin", "quantity", "saleDate", "orderId", "currency",
        "productAmount", "shippingAmount", "giftAmount", "fc",
        "shipCity", "shipState", "shipPostalCode", "store",
        "uploadedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${r.msku},
        ${r.fnsku},
        ${r.asin},
        ${r.quantity},
        ${r.saleDate},
        ${r.orderId},
        ${r.currency},
        ${rawDec(r.productAmount)},
        ${rawDec(r.shippingAmount)},
        ${rawDec(r.giftAmount)},
        ${r.fc},
        ${r.shipCity},
        ${r.shipState},
        ${r.shipPostalCode},
        NULL,
        ${batchAt},
        ${batchAt},
        ${batchAt}
      )
      ON CONFLICT ("orderId", "saleDate") DO UPDATE SET
        "msku" = EXCLUDED."msku",
        "fnsku" = EXCLUDED."fnsku",
        "asin" = EXCLUDED."asin",
        "quantity" = EXCLUDED."quantity",
        "currency" = EXCLUDED."currency",
        "productAmount" = EXCLUDED."productAmount",
        "shippingAmount" = EXCLUDED."shippingAmount",
        "giftAmount" = EXCLUDED."giftAmount",
        "fc" = EXCLUDED."fc",
        "shipCity" = EXCLUDED."shipCity",
        "shipState" = EXCLUDED."shipState",
        "shipPostalCode" = EXCLUDED."shipPostalCode",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    if (existed) sk += 1;
    else ins += 1;
  }

  return { totalRows: rows.length, rowsInserted: ins, rowsSkipped: sk + bad };
}

async function processReceipts(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, ""),
  );
  const sample = allRows.slice(1, 5).map((r) =>
    String(r[5] ?? "")
      .trim()
      .toLowerCase(),
  );
  const isReceiptsType = sample.some((v) => v.includes("receipt"));
  if (!hdr.some((c) => c.includes("fnsku")) || !isReceiptsType) {
    throw new Error(
      "Not FBA Receipts — Event Type should reference Receipts and FNSKU column must exist.",
    );
  }

  const dataRows = allRows.slice(1).filter((r) => r[3] && String(r[3]).trim());
  const map: Record<
    string,
    {
      msku: string;
      fnsku: string;
      asin: string;
      title: string;
      event_type: string;
      shipmentId: string;
      fc: string;
      disposition: string;
      reason: string;
      country: string;
      recon_qty: number;
      unrecon_qty: number;
      qty: number;
      date: Date | null;
      recv_dt: Date | null;
      store: string;
    }
  > = {};

  for (const row of dataRows) {
    const msku = String(row[3] ?? "").trim();
    const fnsku = String(row[1] ?? "").trim();
    const asin = String(row[2] ?? "").trim();
    const title = String(row[4] ?? "").trim();
    const event_type = String(row[5] ?? "").trim();
    const shipmentId = String(row[6] ?? "").trim();
    const qty = toNum(row[7]);
    const fc = String(row[8] ?? "").trim();
    const disposition = String(row[9] ?? "").trim();
    const reason = String(row[10] ?? "").trim();
    const country =
      row.length > 11 ? String(row[11] ?? "").trim() : "";
    const recon_qty = toNum(row[12]);
    const unrecon_qty = toNum(row[13]);
    const datetime_raw = String(row[14] ?? "").trim();
    const store = String(row[15] ?? "")
      .replace(/[\r\n]/g, "")
      .trim();
    const date = toDate(row[0]);
    const recv_dt = datetime_raw ? toDate(datetime_raw) : date;
    if (!fnsku && !msku) continue;
    const key =
      fnsku +
      "|||" +
      shipmentId +
      "|||" +
      (date?.toISOString() ?? "");
    if (!map[key]) {
      map[key] = {
        msku,
        fnsku,
        asin,
        title,
        event_type,
        shipmentId,
        fc,
        disposition,
        reason,
        country,
        recon_qty: 0,
        unrecon_qty: 0,
        qty: 0,
        date,
        recv_dt,
        store,
      };
    }
    map[key].qty += qty;
    map[key].recon_qty += recon_qty;
    map[key].unrecon_qty += unrecon_qty;
  }

  const entries = Object.values(map);
  let ins = 0;
  let sk = 0;
  let bad = 0;
  for (const e of entries) {
    if (!e.date || !e.fnsku) {
      bad += 1;
      continue;
    }
    const shipId = e.shipmentId ?? "";
    const existed = await tx.fbaReceipt.findFirst({
      where: {
        fnsku: e.fnsku,
        receiptDate: e.date,
        shipmentId: shipId,
      },
    });
    await tx.$executeRaw`
      INSERT INTO "fba_receipts" (
        "id", "msku", "title", "asin", "fnsku", "quantity", "receiptDate", "shipmentId",
        "eventType", "fulfillmentCenter", "disposition", "reason", "country",
        "reconciledQty", "unreconciledQty", "receiptDatetime", "store",
        "uploadedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${e.msku || null},
        ${e.title || null},
        ${e.asin || null},
        ${e.fnsku || null},
        ${e.qty},
        ${e.date},
        ${shipId},
        ${e.event_type || null},
        ${e.fc || null},
        ${e.disposition || null},
        ${e.reason || null},
        ${e.country || null},
        ${e.recon_qty || 0},
        ${e.unrecon_qty || 0},
        ${e.recv_dt},
        ${e.store || null},
        ${batchAt},
        ${batchAt},
        ${batchAt}
      )
      ON CONFLICT ("fnsku", "receiptDate", "shipmentId") DO UPDATE SET
        "title" = EXCLUDED."title",
        "asin" = EXCLUDED."asin",
        "quantity" = EXCLUDED."quantity",
        "shipmentId" = EXCLUDED."shipmentId",
        "reason" = EXCLUDED."reason",
        "country" = EXCLUDED."country",
        "reconciledQty" = EXCLUDED."reconciledQty",
        "unreconciledQty" = EXCLUDED."unreconciledQty",
        "receiptDatetime" = EXCLUDED."receiptDatetime",
        "store" = EXCLUDED."store",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    if (existed) sk += 1;
    else ins += 1;
  }

  return { totalRows: entries.length, rowsInserted: ins, rowsSkipped: sk + bad };
}

async function processReturns(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, ""),
  );
  if (
    !hdr.some((c) => c.includes("return-date") || c.includes("return date"))
  ) {
    throw new Error(
      'Not Customer Returns — expected a "return-date" column.',
    );
  }
  if (!hdr.some((c) => c.includes("disposition"))) {
    throw new Error(
      'Not Customer Returns — missing a "disposition" column in the header.',
    );
  }

  const dataRows = allRows.slice(1).filter((r) => r[2] && String(r[2]).trim());
  type RetRow = {
    msku: string;
    asin: string | null;
    fnsku: string | null;
    title: string | null;
    quantity: number;
    disposition: string | null;
    detailedDisposition: string | null;
    reason: string | null;
    status: string | null;
    returnDate: Date | null;
    orderId: string | null;
    fulfillmentCenter: string | null;
    licensePlateNumber: string | null;
    customerComments: string | null;
  };
  const rows = dataRows
    .map((row) => {
      const msku = String(row[2] ?? "").trim();
      if (!msku) return null;
      const det_disp = String(row[8] ?? "").trim();
      const disp = det_disp.split("_")[0] || det_disp;
      return {
        msku,
        asin: String(row[3] ?? "").trim() || null,
        fnsku: String(row[4] ?? "").trim() || null,
        title: String(row[5] ?? "").trim() || null,
        quantity: toNum(row[6]),
        disposition: disp || null,
        detailedDisposition: det_disp || null,
        reason: String(row[9] ?? "").trim() || null,
        status: String(row[10] ?? "").trim() || null,
        returnDate: toDate(row[0]),
        orderId: String(row[1] ?? "").trim() || null,
        fulfillmentCenter: String(row[7] ?? "").trim() || null,
        licensePlateNumber: String(row[11] ?? "").trim() || null,
        customerComments:
          String(row[12] ?? "")
            .replace(/[\r\n]/g, "")
            .trim() || null,
      };
    })
    .filter(Boolean) as RetRow[];

  let ins = 0;
  let sk = 0;
  for (const r of rows) {
    if (!r.orderId || !r.fnsku || !r.returnDate) continue;
    const existed = await tx.customerReturn.findFirst({
      where: {
        orderId: r.orderId,
        fnsku: r.fnsku,
        returnDate: r.returnDate,
      },
    });
    await tx.$executeRaw`
      INSERT INTO "customer_returns" (
        "id", "msku", "asin", "fnsku", "title", "quantity", "disposition", "detailedDisposition",
        "reason", "status", "returnDate", "orderId", "fulfillmentCenter", "licensePlateNumber",
        "customerComments", "store", "uploadedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${r.msku},
        ${r.asin},
        ${r.fnsku},
        ${r.title},
        ${r.quantity},
        ${r.disposition},
        ${r.detailedDisposition},
        ${r.reason},
        ${r.status},
        ${r.returnDate},
        ${r.orderId},
        ${r.fulfillmentCenter},
        ${r.licensePlateNumber},
        ${r.customerComments},
        NULL,
        ${batchAt},
        ${batchAt},
        ${batchAt}
      )
      ON CONFLICT ("orderId", "fnsku", "returnDate") DO UPDATE SET
        "msku" = EXCLUDED."msku",
        "asin" = EXCLUDED."asin",
        "title" = EXCLUDED."title",
        "quantity" = EXCLUDED."quantity",
        "disposition" = EXCLUDED."disposition",
        "detailedDisposition" = EXCLUDED."detailedDisposition",
        "reason" = EXCLUDED."reason",
        "status" = EXCLUDED."status",
        "fulfillmentCenter" = EXCLUDED."fulfillmentCenter",
        "licensePlateNumber" = EXCLUDED."licensePlateNumber",
        "customerComments" = EXCLUDED."customerComments",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    if (existed) sk += 1;
    else ins += 1;
  }

  const skippedMissingKey = rows.filter(
    (r) => !r.orderId || !r.fnsku || !r.returnDate,
  ).length;
  return {
    totalRows: rows.length,
    rowsInserted: ins,
    rowsSkipped: sk + skippedMissingKey,
  };
}

async function processReimbursements(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, ""),
  );
  if (
    !hdr.some(
      (c) =>
        c.includes("reimbursement-id") ||
        c.includes("reimbursement id"),
    )
  ) {
    throw new Error(
      'Not Reimbursements — expected a "reimbursement-id" column.',
    );
  }

  type RRow = {
    approvalDate: Date | null;
    reimbursementId: string | null;
    caseId: string | null;
    amazonOrderId: string | null;
    reason: string | null;
    msku: string;
    fnsku: string | null;
    asin: string | null;
    title: string | null;
    conditionVal: string | null;
    currency: string;
    amountPerUnit: Prisma.Decimal | null;
    amount: Prisma.Decimal | null;
    qtyCash: number;
    qtyInventory: number;
    quantity: number;
    originalReimbId: string | null;
    originalReimbType: string | null;
  };

  const dataRows = allRows.slice(1).filter((r) => r[5] && String(r[5]).trim());
  const rows = dataRows
    .map((row) => {
      const msku = String(row[5] ?? "").trim();
      if (!msku) return null;
      return {
        approvalDate: toDate(row[0]),
        reimbursementId: String(row[1] ?? "").trim() || null,
        caseId: String(row[2] ?? "").trim() || null,
        amazonOrderId: String(row[3] ?? "").trim() || null,
        reason: String(row[4] ?? "").trim() || null,
        msku,
        fnsku: String(row[6] ?? "").trim() || null,
        asin: String(row[7] ?? "").trim() || null,
        title: String(row[8] ?? "").trim() || null,
        conditionVal: String(row[9] ?? "").trim() || null,
        currency: String(row[10] ?? "USD").trim() || "USD",
        amountPerUnit: decMoney(row[11]),
        amount: decMoney(row[12]),
        qtyCash: toNum(row[13]),
        qtyInventory: toNum(row[14]),
        quantity: toNum(row[15]),
        originalReimbId: String(row[16] ?? "").trim() || null,
        originalReimbType:
          String(row[17] ?? "")
            .replace(/[\r\n]/g, "")
            .trim() || null,
      };
    })
    .filter(Boolean) as RRow[];

  let ins = 0;
  let sk = 0;
  let bad = 0;
  for (const r of rows) {
    if (!r.reimbursementId) {
      bad += 1;
      continue;
    }
    const existed = await tx.reimbursement.findFirst({
      where: {
        reimbursementId: r.reimbursementId,
        msku: r.msku,
        fnsku: r.fnsku ?? "",
      },
    });
    await tx.$executeRaw`
      INSERT INTO "reimbursements" (
        "id", "approvalDate", "reimbursementId", "caseId", "amazonOrderId", "reason",
        "msku", "fnsku", "asin", "title", "conditionVal", "currency", "amountPerUnit", "amount",
        "qtyCash", "qtyInventory", "quantity", "originalReimbId", "originalReimbType",
        "store", "uploadedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${r.approvalDate},
        ${r.reimbursementId},
        ${r.caseId},
        ${r.amazonOrderId},
        ${r.reason},
        ${r.msku},
        ${r.fnsku},
        ${r.asin},
        ${r.title},
        ${r.conditionVal},
        ${r.currency},
        ${rawDec(r.amountPerUnit)},
        ${rawDec(r.amount)},
        ${r.qtyCash},
        ${r.qtyInventory},
        ${r.quantity},
        ${r.originalReimbId},
        ${r.originalReimbType},
        NULL,
        ${batchAt},
        ${batchAt},
        ${batchAt}
      )
      ON CONFLICT ("reimbursementId", "msku", "fnsku") DO UPDATE SET
        "approvalDate" = EXCLUDED."approvalDate",
        "caseId" = EXCLUDED."caseId",
        "amazonOrderId" = EXCLUDED."amazonOrderId",
        "reason" = EXCLUDED."reason",
        "asin" = EXCLUDED."asin",
        "title" = EXCLUDED."title",
        "conditionVal" = EXCLUDED."conditionVal",
        "currency" = EXCLUDED."currency",
        "amountPerUnit" = EXCLUDED."amountPerUnit",
        "amount" = EXCLUDED."amount",
        "qtyCash" = EXCLUDED."qtyCash",
        "qtyInventory" = EXCLUDED."qtyInventory",
        "quantity" = EXCLUDED."quantity",
        "originalReimbId" = EXCLUDED."originalReimbId",
        "originalReimbType" = EXCLUDED."originalReimbType",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    if (existed) sk += 1;
    else ins += 1;
  }

  return {
    totalRows: rows.length,
    rowsInserted: ins,
    rowsSkipped: sk + bad,
  };
}

async function processRemovals(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, ""),
  );
  if (
    !hdr.some(
      (c) =>
        c.includes("order-id") ||
        c.includes("order id"),
    ) ||
    !hdr.some((c) => c.includes("disposition"))
  ) {
    throw new Error(
      'Not FBA Removals — expected "order-id" and "disposition" columns.',
    );
  }
  if (
    !hdr.some(
      (c) =>
        c.includes("order-type") ||
        c.includes("order type") ||
        c.includes("order"),
    )
  ) {
    throw new Error('Not FBA Removals — expected an "order-type" style column.');
  }

  type RemRow = {
    msku: string | null;
    fnsku: string | null;
    disposition: string | null;
    orderStatus: string | null;
    orderId: string | null;
    requestDate: Date | null;
    orderSource: string | null;
    orderType: string | null;
    lastUpdated: Date | null;
    cancelledQty: number;
    disposedQty: number;
    quantity: number;
    inProcessQty: number;
    removalFee: Prisma.Decimal | null;
    currency: string;
  };

  const dataRows = allRows.slice(1).filter((r) => r[6] && String(r[6]).trim());
  const rows = dataRows
    .map((row) => {
      const msku = String(row[6] ?? "").trim();
      const fnsku = String(row[7] ?? "").trim();
      if (!msku && !fnsku) return null;
      return {
        msku: msku || null,
        fnsku: fnsku || null,
        disposition: String(row[8] ?? "").trim() || null,
        orderStatus: String(row[4] ?? "").trim() || null,
        orderId: String(row[1] ?? "").trim() || null,
        requestDate: toDate(row[0]),
        orderSource: String(row[2] ?? "").trim() || null,
        orderType: String(row[3] ?? "").trim() || null,
        lastUpdated: toDate(row[5]),
        cancelledQty: toNum(row[10]),
        disposedQty: toNum(row[11]),
        quantity: toNum(row[12]),
        inProcessQty: toNum(row[13]),
        removalFee: decMoney(row[14]),
        currency:
          String(row[15] ?? "USD")
            .replace(/[\r\n]/g, "")
            .trim() || "USD",
      };
    })
    .filter(Boolean) as RemRow[];

  let ins = 0;
  let sk = 0;
  let bad = 0;
  for (const r of rows) {
    if (!r.orderId || !r.fnsku || !r.requestDate) {
      bad += 1;
      continue;
    }
    const existed = await tx.fbaRemoval.findFirst({
      where: {
        orderId: r.orderId,
        fnsku: r.fnsku,
        requestDate: r.requestDate,
      },
    });
    await tx.$executeRaw`
      INSERT INTO "fba_removals" (
        "id", "msku", "fnsku", "quantity", "disposition", "orderStatus", "orderId", "requestDate",
        "orderSource", "orderType", "lastUpdated", "cancelledQty", "disposedQty", "inProcessQty",
        "removalFee", "currency", "store", "uploadedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${r.msku},
        ${r.fnsku},
        ${r.quantity},
        ${r.disposition},
        ${r.orderStatus},
        ${r.orderId},
        ${r.requestDate},
        ${r.orderSource},
        ${r.orderType},
        ${r.lastUpdated},
        ${r.cancelledQty},
        ${r.disposedQty},
        ${r.inProcessQty},
        ${rawDec(r.removalFee)},
        ${r.currency},
        NULL,
        ${batchAt},
        ${batchAt},
        ${batchAt}
      )
      ON CONFLICT ("orderId", "fnsku", "requestDate") DO UPDATE SET
        "msku" = EXCLUDED."msku",
        "disposition" = EXCLUDED."disposition",
        "orderStatus" = EXCLUDED."orderStatus",
        "orderSource" = EXCLUDED."orderSource",
        "orderType" = EXCLUDED."orderType",
        "lastUpdated" = EXCLUDED."lastUpdated",
        "cancelledQty" = EXCLUDED."cancelledQty",
        "disposedQty" = EXCLUDED."disposedQty",
        "quantity" = EXCLUDED."quantity",
        "inProcessQty" = EXCLUDED."inProcessQty",
        "removalFee" = EXCLUDED."removalFee",
        "currency" = EXCLUDED."currency",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    if (existed) sk += 1;
    else ins += 1;
  }

  return {
    totalRows: rows.length,
    rowsInserted: ins,
    rowsSkipped: sk + bad,
  };
}

async function processFcTransfers(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, ""),
  );
  const sample = allRows.slice(1, 5).map((r) =>
    String(r[5] ?? "")
      .trim()
      .toLowerCase(),
  );
  const isFCType = sample.some(
    (v) => v.includes("whse") || v.includes("transfer"),
  );
  if (!hdr.some((c) => c.includes("fnsku"))) {
    throw new Error("Not FC Transfers — FNSKU column missing.");
  }
  if (!isFCType) {
    throw new Error(
      'Not FC Transfers — Event Type should reference warehouse transfers (e.g. "WhseTransfers").',
    );
  }

  type FtRow = {
    msku: string | null;
    fnsku: string | null;
    asin: string | null;
    title: string | null;
    quantity: number;
    transferDate: Date | null;
    eventType: string | null;
    referenceId: string | null;
    fulfillmentCenter: string | null;
    disposition: string | null;
    reason: string | null;
    country: string | null;
    reconciledQty: number;
    unreconciledQty: number;
    transferDatetime: Date | null;
    store: string | null;
  };

  const dataRows = allRows.slice(1).filter((r) => r[3] && String(r[3]).trim());

  // Dedupe by (fnsku, transferDate, referenceId) — Amazon may emit multiple
  // rows per key with split quantities; sum them so ON CONFLICT does not
  // discard rows. Mirrors processReceipts pattern.
  const grouped = new Map<string, FtRow>();
  for (const row of dataRows) {
    const msku = String(row[3] ?? "").trim();
    const fnsku = String(row[1] ?? "").trim();
    if (!msku && !fnsku) continue;
    const dt_raw = String(row[14] ?? "").trim();
    const date = toDate(row[0]);
    const recv_dt = dt_raw ? toDate(dt_raw) : date;
    const referenceId = String(row[6] ?? "").trim();
    const qty = toNum(row[7]);
    const reconQty = toNum(row[12]);
    const unreconQty = toNum(row[13]);
    const key = `${fnsku}|||${date?.toISOString() ?? ""}|||${referenceId}`;
    const prev = grouped.get(key);
    if (prev) {
      prev.quantity += qty;
      prev.reconciledQty += reconQty;
      prev.unreconciledQty += unreconQty;
      continue;
    }
    grouped.set(key, {
      msku: msku || null,
      fnsku: fnsku || null,
      asin: String(row[2] ?? "").trim() || null,
      title: String(row[4] ?? "").trim() || null,
      quantity: qty,
      transferDate: date,
      eventType: String(row[5] ?? "").trim() || null,
      referenceId: referenceId || null,
      fulfillmentCenter: String(row[8] ?? "").trim() || null,
      disposition: String(row[9] ?? "").trim() || null,
      reason: String(row[10] ?? "").trim() || null,
      country: String(row[11] ?? "").trim() || null,
      reconciledQty: reconQty,
      unreconciledQty: unreconQty,
      transferDatetime: recv_dt,
      store:
        String(row[15] ?? "")
          .replace(/[\r\n]/g, "")
          .trim() || null,
    });
  }
  const rows = Array.from(grouped.values());

  let ins = 0;
  let sk = 0;
  let bad = 0;
  for (const r of rows) {
    if (!r.transferDate || !r.fnsku) {
      bad += 1;
      continue;
    }
    const refId = r.referenceId ?? "";
    // Single round-trip: INSERT ... ON CONFLICT ... RETURNING xmax = 0 lets
    // us distinguish inserts from updates without a separate SELECT.
    const result = await tx.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO "fc_transfers" (
        "id", "msku", "fnsku", "asin", "title", "quantity", "transferDate", "eventType", "referenceId",
        "fulfillmentCenter", "disposition", "reason", "country", "reconciledQty", "unreconciledQty",
        "transferDatetime", "store", "uploadedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${r.msku},
        ${r.fnsku},
        ${r.asin},
        ${r.title},
        ${r.quantity},
        ${r.transferDate},
        ${r.eventType},
        ${refId},
        ${r.fulfillmentCenter},
        ${r.disposition},
        ${r.reason},
        ${r.country},
        ${r.reconciledQty},
        ${r.unreconciledQty},
        ${r.transferDatetime},
        ${r.store},
        ${batchAt},
        ${batchAt},
        ${batchAt}
      )
      ON CONFLICT ("fnsku", "transferDate", "referenceId") DO UPDATE SET
        "asin" = EXCLUDED."asin",
        "title" = EXCLUDED."title",
        "quantity" = EXCLUDED."quantity",
        "disposition" = EXCLUDED."disposition",
        "reason" = EXCLUDED."reason",
        "country" = EXCLUDED."country",
        "reconciledQty" = EXCLUDED."reconciledQty",
        "unreconciledQty" = EXCLUDED."unreconciledQty",
        "transferDatetime" = EXCLUDED."transferDatetime",
        "store" = EXCLUDED."store",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
      RETURNING (xmax = 0) AS inserted
    `;
    if (result[0]?.inserted) ins += 1;
    else sk += 1;
  }

  return { totalRows: rows.length, rowsInserted: ins, rowsSkipped: sk + bad };
}

async function processShipmentStatus(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/\ufeff/g, ""),
  );
  const ok =
    hdr.some(
      (c) =>
        c.includes("shipment id") ||
        c.includes("shipment-id") ||
        c.includes("shipmentid"),
    ) &&
    hdr.some((c) => c.includes("expected") || c.includes("units expected"));
  if (!ok) {
    throw new Error(
      "Not Shipment Receiving / Status — need Shipment ID and Units expected columns.",
    );
  }

  type SRow = {
    shipmentName: string | null;
    shipmentId: string;
    createdDate: Date | null;
    lastUpdated: Date | null;
    shipTo: string | null;
    totalSkus: number;
    unitsExpected: number;
    unitsLocated: number;
    status: string | null;
  };

  const dataRows = allRows.slice(1).filter((r) => r[1] && String(r[1]).trim());
  const rows = dataRows
    .map((row) => {
      const shipmentId = String(row[1] ?? "").trim();
      if (!shipmentId) return null;
      return {
        shipmentName: String(row[0] ?? "").trim() || null,
        shipmentId,
        createdDate: toDate(row[2]),
        lastUpdated: toDate(row[3]),
        shipTo: String(row[4] ?? "").trim() || null,
        totalSkus: toNum(row[5]),
        unitsExpected: toNum(row[6]),
        unitsLocated: toNum(row[7]),
        status: String(row[8] ?? "").trim() || null,
      };
    })
    .filter(Boolean) as SRow[];

  let ins = 0;
  let sk = 0;
  for (const r of rows) {
    const existed = await tx.shipmentStatus.findFirst({
      where: { shipmentId: r.shipmentId },
    });
    await tx.$executeRaw`
      INSERT INTO "shipment_status" (
        "id", "shipmentName", "shipmentId", "createdDate", "lastUpdated", "shipTo",
        "totalSkus", "unitsExpected", "unitsLocated", "status", "store",
        "uploadedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${r.shipmentName},
        ${r.shipmentId},
        ${r.createdDate},
        ${r.lastUpdated},
        ${r.shipTo},
        ${r.totalSkus},
        ${r.unitsExpected},
        ${r.unitsLocated},
        ${r.status},
        NULL,
        ${batchAt},
        ${batchAt},
        ${batchAt}
      )
      ON CONFLICT ("shipmentId") DO UPDATE SET
        "shipmentName" = EXCLUDED."shipmentName",
        "createdDate" = EXCLUDED."createdDate",
        "lastUpdated" = EXCLUDED."lastUpdated",
        "shipTo" = EXCLUDED."shipTo",
        "totalSkus" = EXCLUDED."totalSkus",
        "unitsExpected" = EXCLUDED."unitsExpected",
        "unitsLocated" = EXCLUDED."unitsLocated",
        "status" = EXCLUDED."status",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    if (existed) sk += 1;
    else ins += 1;
  }

  return { totalRows: rows.length, rowsInserted: ins, rowsSkipped: sk };
}

async function processFbaSummary(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdrSummary = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, ""),
  );
  const findCol = (...terms: string[]) => {
    for (const t of terms) {
      const i = hdrSummary.findIndex((h) => h.includes(t));
      if (i !== -1) return i;
    }
    return -1;
  };

  if (
    !hdrSummary.some(
      (c) =>
        c.includes("ending") ||
        c.includes("disposition") ||
        c.includes("fnsku"),
    )
  ) {
    throw new Error(
      "Not FBA Summary — expected columns such as FNSKU, disposition, ending balance.",
    );
  }

  const iDate = findCol("date");
  const iFnsku = findCol("fnsku");
  const iAsin = findCol("asin");
  const iMsku = findCol("msku", "sku");
  const iTitle = findCol("product name", "title");
  const iDisp = findCol("disposition");
  const iStart = findCol(
    "starting warehouse",
    "starting balance",
    "starting inventory",
  );
  const iTransit = findCol("in transit between", "in-transit", "in transit");
  const iRecpts = findCol("receipts");
  const iShip = findCol("customer shipments", "customer ship");
  const iReturn = findCol("customer returns");
  const iVendor = findCol("vendor returns");
  const iXfer = findCol("warehouse transfer");
  const iFound = findCol("found");
  const iLost = findCol("lost");
  const iDamage = findCol("damaged");
  const iDispos = findCol("dispos");
  const iOther = findCol("other events");
  const iEnding = findCol(
    "ending warehouse",
    "ending inventory",
    "ending balance",
  );
  const iUnknown = findCol("unknown events", "unknown");
  const iLoc = findCol("location");
  const iStore = findCol("store");

  if (iFnsku === -1 || iEnding === -1) {
    throw new Error(
      `Required FBA Summary columns not found. First headers: ${hdrSummary.slice(0, 12).join(", ")}`,
    );
  }

  const get = (row: string[], idx: number) =>
    idx === -1 ? "" : String(row[idx] ?? "");

  const dataRows = allRows
    .slice(1)
    .filter((r) => get(r, iFnsku) && String(get(r, iFnsku)).trim());

  const map: Record<
    string,
    {
      msku: string;
      fnsku: string;
      asin: string;
      title: string;
      disp: string;
      ending: number;
      starting: number;
      in_transit: number;
      receipts: number;
      shipments: number;
      returns: number;
      vendor_ret: number;
      transfer: number;
      found: number;
      lost: number;
      damaged: number;
      disposed: number;
      other: number;
      unknown: number;
      location: string;
      store: string;
      date: Date | null;
    }
  > = {};

  for (const row of dataRows) {
    const msku = String(get(row, iMsku)).trim();
    const fnsku = String(get(row, iFnsku)).trim();
    const asin = String(get(row, iAsin)).trim();
    const title = String(get(row, iTitle)).trim();
    const disp = String(get(row, iDisp)).trim();
    const starting = toNum(get(row, iStart));
    const in_transit = toNum(get(row, iTransit));
    const receipts = toNum(get(row, iRecpts));
    const shipments = toNum(get(row, iShip));
    const returns = toNum(get(row, iReturn));
    const vendor_ret = toNum(get(row, iVendor));
    const transfer = toNum(get(row, iXfer));
    const found = toNum(get(row, iFound));
    const lost = toNum(get(row, iLost));
    const damaged = toNum(get(row, iDamage));
    const disposed = toNum(get(row, iDispos));
    const other = toNum(get(row, iOther));
    const ending = toNum(get(row, iEnding));
    const unknown = toNum(get(row, iUnknown));
    const location = String(get(row, iLoc)).trim();
    const store = String(get(row, iStore))
      .replace(/[\r\n]/g, "")
      .trim();
    const date = toDate(get(row, iDate));
    if (!fnsku) continue;
    const key = [msku || "", fnsku, disp || "", date?.toISOString() ?? "", store || ""].join("|");
    if (!map[key]) {
      map[key] = {
        msku,
        fnsku,
        asin,
        title,
        disp,
        ending: 0,
        starting: 0,
        in_transit: 0,
        receipts: 0,
        shipments: 0,
        returns: 0,
        vendor_ret: 0,
        transfer: 0,
        found: 0,
        lost: 0,
        damaged: 0,
        disposed: 0,
        other: 0,
        unknown: 0,
        location,
        store,
        date,
      };
    }
    map[key].ending += ending;
    map[key].starting += starting;
    map[key].in_transit += in_transit;
    map[key].receipts += receipts;
    map[key].shipments += shipments;
    map[key].returns += returns;
    map[key].vendor_ret += vendor_ret;
    map[key].transfer += transfer;
    map[key].found += found;
    map[key].lost += lost;
    map[key].damaged += damaged;
    map[key].disposed += disposed;
    map[key].other += other;
    map[key].unknown += unknown;
  }

  const entries = Object.values(map);
  let ins = 0;
  let sk = 0;
  let bad = 0;
  for (const e of entries) {
    if (!e.date || !e.fnsku) {
      bad += 1;
      continue;
    }
    const mskuK = e.msku ?? "";
    const dispK = e.disp ?? "";
    const storeK = e.store ?? "";
    const existed = await tx.fbaSummary.findFirst({
      where: {
        msku: mskuK,
        fnsku: e.fnsku,
        disposition: dispK,
        summaryDate: e.date,
        store: storeK,
      },
    });
    await tx.$executeRaw`
      INSERT INTO "fba_summary" (
        "id", "msku", "fnsku", "asin", "title", "disposition", "endingBalance", "startingBalance",
        "inTransit", "receipts", "customerShipments", "customerReturns", "vendorReturns",
        "warehouseTransfer", "found", "lost", "damaged", "disposedQty", "otherEvents",
        "unknownEvents", "location", "store", "summaryDate", "uploadedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${e.msku || null},
        ${e.fnsku || null},
        ${e.asin || null},
        ${e.title || null},
        ${e.disp || null},
        ${e.ending},
        ${e.starting},
        ${e.in_transit},
        ${e.receipts},
        ${e.shipments},
        ${e.returns},
        ${e.vendor_ret},
        ${e.transfer},
        ${e.found},
        ${e.lost},
        ${e.damaged},
        ${e.disposed},
        ${e.other},
        ${e.unknown},
        ${e.location || null},
        ${e.store || null},
        ${e.date},
        ${batchAt},
        ${batchAt},
        ${batchAt}
      )
      ON CONFLICT ("msku", "fnsku", "disposition", "summaryDate", "store") DO UPDATE SET
        "asin" = EXCLUDED."asin",
        "title" = EXCLUDED."title",
        "endingBalance" = EXCLUDED."endingBalance",
        "startingBalance" = EXCLUDED."startingBalance",
        "inTransit" = EXCLUDED."inTransit",
        "receipts" = EXCLUDED."receipts",
        "customerShipments" = EXCLUDED."customerShipments",
        "customerReturns" = EXCLUDED."customerReturns",
        "vendorReturns" = EXCLUDED."vendorReturns",
        "warehouseTransfer" = EXCLUDED."warehouseTransfer",
        "found" = EXCLUDED."found",
        "lost" = EXCLUDED."lost",
        "damaged" = EXCLUDED."damaged",
        "disposedQty" = EXCLUDED."disposedQty",
        "otherEvents" = EXCLUDED."otherEvents",
        "unknownEvents" = EXCLUDED."unknownEvents",
        "location" = EXCLUDED."location",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    if (existed) sk += 1;
    else ins += 1;
  }

  return { totalRows: entries.length, rowsInserted: ins, rowsSkipped: sk + bad };
}

async function processReplacements(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const rawHdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/[?'"]/g, ""),
  );
  const ci = (name: string) =>
    rawHdr.findIndex((h) => h.replace(/[-_\s]/g, "").includes(name.replace(/[-_\s]/g, "")));

  const idxDate = ci("shipment-date");
  let idxSku = rawHdr.findIndex((h) => h === "sku" || h === "msku");
  if (idxSku === -1) idxSku = rawHdr.findIndex((h) => h.includes("merchant"));
  const idxAsin = rawHdr.findIndex((h) => h === "asin");
  const idxFc = ci("fulfillment-center-id");
  const idxOrigFc = ci("original-fulfillment-center-id");
  const idxQty = rawHdr.findIndex((h) => h === "quantity");
  const idxReason = ci("replacement-reason-code");
  const idxReplOrd = ci("replacement-amazon-order-id");
  const idxOrigOrd = ci("original-amazon-order-id");

  const hasRequired =
    idxSku >= 0 && (idxReplOrd >= 0 || idxOrigOrd >= 0);
  if (!hasRequired) {
    throw new Error(
      "Not Replacements — expected sku and replacement / original Amazon order id columns.",
    );
  }

  const dataRows = allRows.slice(1).filter((r) => r.some((c) => String(c ?? "").trim()));
  let ins = 0;
  let sk = 0;
  for (const row of dataRows) {
    const msku = String(row[idxSku] ?? "").trim();
    if (!msku) continue;
    const replacementOrdId =
      idxReplOrd >= 0 ? String(row[idxReplOrd] ?? "").trim() : "";
    const originalOrdId =
      idxOrigOrd >= 0 ? String(row[idxOrigOrd] ?? "").trim() : "";
    const shipDate =
      idxDate >= 0 ? toDate(row[idxDate]) : null;

    const payload = {
      msku,
      orderId: replacementOrdId || originalOrdId || null,
      quantity:
        idxQty >= 0
          ? parseInt(String(row[idxQty] ?? "0").replace(/,/g, ""), 10) || 0
          : 0,
      asin: idxAsin >= 0 ? String(row[idxAsin] ?? "").trim() || null : null,
      fulfillmentCenterId:
        idxFc >= 0 ? String(row[idxFc] ?? "").trim() || null : null,
      originalFulfillmentCenterId:
        idxOrigFc >= 0 ? String(row[idxOrigFc] ?? "").trim() || null : null,
      replacementReasonCode:
        idxReason >= 0 ? String(row[idxReason] ?? "").trim() || null : null,
      replacementOrderId: replacementOrdId || null,
      originalOrderId: originalOrdId || null,
      shipmentDate: shipDate,
      uploadedAt: batchAt,
    };

    if (replacementOrdId) {
      // payload.orderId resolves to replacementOrdId (or originalOrdId) in this
      // branch, but Prisma's composite key expects non-null fields.
      const compositeKey = {
        orderId: payload.orderId ?? replacementOrdId,
        msku: payload.msku,
        replacementOrderId: replacementOrdId,
      };
      const existed = await tx.replacement.findUnique({
        where: {
          orderId_msku_replacementOrderId: compositeKey,
        },
      });
      await tx.replacement.upsert({
        where: {
          orderId_msku_replacementOrderId: compositeKey,
        },
        create: payload,
        update: {
          quantity: payload.quantity,
          asin: payload.asin,
          fulfillmentCenterId: payload.fulfillmentCenterId,
          originalFulfillmentCenterId: payload.originalFulfillmentCenterId,
          replacementReasonCode: payload.replacementReasonCode,
          originalOrderId: payload.originalOrderId,
          shipmentDate: payload.shipmentDate,
          uploadedAt: batchAt,
        },
      });
      if (existed) sk += 1;
      else ins += 1;
    } else {
      await tx.replacement.create({ data: payload });
      ins += 1;
    }
  }

  return { totalRows: dataRows.length, rowsInserted: ins, rowsSkipped: sk };
}

async function processAdjustments(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const dataRows = allRows.slice(1);
  const agg: Record<string, number> = {};
  for (const row of dataRows) {
    if (String(row[10] ?? "").trim() !== "F") continue;
    const msku = String(row[3] ?? "").trim();
    if (!msku) continue;
    agg[msku] = (agg[msku] ?? 0) + toNum(row[7]);
  }
  const entries = Object.entries(agg);
  let ins = 0;
  let sk = 0;
  for (const [msku, quantity] of entries) {
    const existed = await tx.adjustment.findUnique({ where: { msku } });
    await tx.adjustment.upsert({
      where: { msku },
      create: {
        msku,
        flag: "F",
        quantity,
        uploadedAt: batchAt,
      },
      update: {
        quantity: { increment: quantity },
        flag: "F",
        uploadedAt: batchAt,
      },
    });
    if (existed) sk += 1;
    else ins += 1;
  }
  return { totalRows: entries.length, rowsInserted: ins, rowsSkipped: sk };
}

async function processGnr(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const rawHdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/[?'"]/g, ""),
  );
  const ci = (name: string) =>
    rawHdr.findIndex((h) => h.replace(/[-_\s]/g, "").includes(name.replace(/[-_\s]/g, "")));

  const idxDate = ci("date");
  const idxOrderId = ci("orderid");
  const idxType = ci("valuerecoverytype");
  const idxLpn = ci("lpn");
  const idxManualId = ci("manualorderitemid");
  const idxMsku = rawHdr.findIndex(
    (h) => h === "merchant-sku" || h === "merchantsku" || h === "sku",
  );
  const idxFnsku = rawHdr.findIndex((h) => h === "fnsku");
  const idxAsin = rawHdr.findIndex((h) => h === "asin");
  const idxQty = rawHdr.findIndex((h) => h === "quantity");
  const idxStatus = ci("unitstatus");
  const idxReason = ci("reasonforunitstatus");
  const idxCondition =
    ci("gradeandresellused-condition") >= 0
      ? ci("gradeandresellused-condition")
      : ci("usedcondition");
  const idxUsedMsku = rawHdr.findIndex(
    (h) => h.includes("grade") && h.includes("merchant"),
  );
  const idxUsedFnsku = rawHdr.findIndex(
    (h) => h.includes("grade") && h.includes("fnsku"),
  );

  if (idxOrderId < 0) {
    throw new Error(
      'Not GNR report — expected an "order-id" column and Grade & Resell style headers.',
    );
  }

  type GRow = {
    reportDate: Date | null;
    orderId: string;
    valueRecoveryType: string | null;
    lpn: string | null;
    manualOrderItemId: string | null;
    msku: string | null;
    fnsku: string | null;
    asin: string | null;
    quantity: number;
    unitStatus: string | null;
    reasonForUnitStatus: string | null;
    usedCondition: string | null;
    usedMsku: string | null;
    usedFnsku: string | null;
  };

  const dataRows = allRows.slice(1).filter((r) => r.some((c) => String(c ?? "").trim()));
  const toSave: GRow[] = [];
  for (const row of dataRows) {
    const orderId = String(row[idxOrderId] ?? "").trim();
    if (!orderId) continue;
    toSave.push({
      reportDate: idxDate >= 0 ? toDate(row[idxDate]) : null,
      orderId,
      valueRecoveryType:
        idxType >= 0 ? String(row[idxType] ?? "").trim() || null : null,
      lpn: idxLpn >= 0 ? String(row[idxLpn] ?? "").trim() || null : null,
      manualOrderItemId:
        idxManualId >= 0 ? String(row[idxManualId] ?? "").trim() || null : null,
      msku:
        idxMsku >= 0 ? String(row[idxMsku] ?? "").trim() || null : null,
      fnsku:
        idxFnsku >= 0 ? String(row[idxFnsku] ?? "").trim() || null : null,
      asin:
        idxAsin >= 0 ? String(row[idxAsin] ?? "").trim() || null : null,
      quantity:
        idxQty >= 0
          ? parseInt(String(row[idxQty] ?? "1").replace(/,/g, ""), 10) || 1
          : 1,
      unitStatus:
        idxStatus >= 0 ? String(row[idxStatus] ?? "").trim() || null : null,
      reasonForUnitStatus:
        idxReason >= 0 ? String(row[idxReason] ?? "").trim() || null : null,
      usedCondition:
        idxCondition >= 0
          ? String(row[idxCondition] ?? "").trim() || null
          : null,
      usedMsku:
        idxUsedMsku >= 0 ? String(row[idxUsedMsku] ?? "").trim() || null : null,
      usedFnsku:
        idxUsedFnsku >= 0
          ? String(row[idxUsedFnsku] ?? "").trim() || null
          : null,
    });
  }

  let ins = 0;
  let sk = 0;
  let bad = 0;
  for (const g of toSave) {
    if (!g.fnsku || !g.reportDate) {
      bad += 1;
      continue;
    }
    const lpnKey = g.lpn ?? "";
    const existed = await tx.gnrReport.findFirst({
      where: {
        orderId: g.orderId,
        fnsku: g.fnsku,
        reportDate: g.reportDate,
        lpn: lpnKey,
      },
    });
    await tx.$executeRaw`
      INSERT INTO "gnr_report" (
        "id", "reportDate", "orderId", "valueRecoveryType", "lpn", "manualOrderItemId",
        "msku", "fnsku", "asin", "quantity", "unitStatus", "reasonForUnitStatus",
        "usedCondition", "usedMsku", "usedFnsku", "store", "uploadedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${g.reportDate},
        ${g.orderId},
        ${g.valueRecoveryType},
        ${lpnKey},
        ${g.manualOrderItemId},
        ${g.msku},
        ${g.fnsku},
        ${g.asin},
        ${g.quantity},
        ${g.unitStatus},
        ${g.reasonForUnitStatus},
        ${g.usedCondition},
        ${g.usedMsku},
        ${g.usedFnsku},
        NULL,
        ${batchAt},
        ${batchAt},
        ${batchAt}
      )
      ON CONFLICT ("orderId", "fnsku", "reportDate", "lpn") DO UPDATE SET
        "valueRecoveryType" = EXCLUDED."valueRecoveryType",
        "manualOrderItemId" = EXCLUDED."manualOrderItemId",
        "msku" = EXCLUDED."msku",
        "asin" = EXCLUDED."asin",
        "quantity" = EXCLUDED."quantity",
        "unitStatus" = EXCLUDED."unitStatus",
        "reasonForUnitStatus" = EXCLUDED."reasonForUnitStatus",
        "usedCondition" = EXCLUDED."usedCondition",
        "usedMsku" = EXCLUDED."usedMsku",
        "usedFnsku" = EXCLUDED."usedFnsku",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    if (existed) sk += 1;
    else ins += 1;
  }

  return {
    totalRows: toSave.length,
    rowsInserted: ins,
    rowsSkipped: sk + bad,
  };
}

async function processPaymentRepository(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/\ufeff/g, ""),
  );
  const findCol = (...terms: string[]) => {
    for (const t of terms) {
      const tl = t.toLowerCase();
      const i = hdr.findIndex((h) => h.includes(tl));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iDate = findCol("date/time", "date / time", "posted date", "posted date/time");
  const iSettle = findCol("settlement id", "settlement-id", "settlement");
  const iType = hdr.findIndex((h) => {
    const x = String(h).toLowerCase().trim();
    return x === "type" || x === "transaction type";
  });
  const iOrder = findCol("order id", "order-id", "amazon order id");
  let iSku = hdr.findIndex((h) => String(h).toLowerCase().trim() === "sku");
  if (iSku === -1) iSku = findCol("merchant sku");
  const iDesc = findCol("description", "product description");
  const iQty = findCol("quantity", "qty");
  const iMkt = findCol("marketplace");
  const iAcct = findCol("account type", "account-type");
  const iFul = findCol("fulfillment");
  const iCity = findCol("order city");
  const iState = findCol("order state");
  const iPostal = findCol("order postal", "postal");
  const iTaxModel = findCol("tax collection model");
  const iProdSales = findCol("product sales");
  const iProdTax = findCol("product sales tax");
  const iShipCred = findCol("shipping credits");
  const iShipCredTax = findCol("shipping credits tax");
  const iGift = findCol("gift wrap credits");
  const iGiftTax = findCol("gift wrap credits tax");
  const iPromo = findCol("promotional rebates");
  const iPromoTax = findCol("promotional rebates tax");
  const iWithheld = findCol("marketplace withheld tax");
  const iSellFee = findCol("selling fees");
  const iFba = findCol("fba fees");
  const iOtherFees = findCol("other transaction fees", "other-transaction fees");
  const iOtherAmt = hdr.findIndex((h) => String(h).toLowerCase().trim() === "other");
  let iTotal = hdr.findIndex((h) => String(h).toLowerCase().trim() === "total");
  if (iTotal === -1) iTotal = findCol("transaction total", "amount");
  const iStatus = findCol("transaction status");
  const iRelease = findCol("transaction release date", "release date");

  const wideHeaderRow = allRows.find((r, i) => i > 0 && r && r.length >= 28);
  const looksPayment =
    hdr.some((h) => h.includes("settlement") && h.includes("id")) ||
    (iProdSales !== -1 && iFba !== -1) ||
    (iDate !== -1 &&
      iTotal !== -1 &&
      (iSku !== -1 || iDesc !== -1)) ||
    Boolean(wideHeaderRow);

  if (!looksPayment) {
    throw new Error(
      "Not Payment Repository — expected settlement id, totals, and SKU/description style columns.",
    );
  }

  const get = (row: string[], idx: number) =>
    idx === -1 ? "" : String(row[idx] ?? "");

  const dataRows = allRows.slice(1).filter((r) => r && r.some((c) => String(c ?? "").trim()));
  type PayRow = Prisma.PaymentRepositoryCreateManyInput;
  const rows: PayRow[] = [];

  for (const row of dataRows) {
    const useWide = iSettle === -1 && row.length >= 28;
    let posted: string;
    let settlement_id: string;
    let line_type: string;
    let order_id: string;
    let sku: string;
    let description: string;
    let qty: number;
    let marketplace: string | null;
    let accountType: string | null;
    let fulfillmentId: string | null;
    let taxCollectionModel: string | null;
    let productSales: Prisma.Decimal | null;
    let productSalesTax: Prisma.Decimal | null;
    let shippingCredits: Prisma.Decimal | null;
    let shippingCreditsTax: Prisma.Decimal | null;
    let giftWrapCredits: Prisma.Decimal | null;
    let giftWrapCreditsTax: Prisma.Decimal | null;
    let promotionalRebates: Prisma.Decimal | null;
    let promotionalRebatesTax: Prisma.Decimal | null;
    let marketplaceWithheldTax: Prisma.Decimal | null;
    let sellingFees: Prisma.Decimal | null;
    let fbaFees: Prisma.Decimal | null;
    let otherTransactionFees: Prisma.Decimal | null;
    let other: Prisma.Decimal | null;
    let total: Prisma.Decimal | null;
    let transactionStatus: string | null;
    let transactionReleaseDatetime: string | null;

    if (useWide) {
      posted = String(row[0] ?? "").trim();
      settlement_id = String(row[1] ?? "").trim();
      line_type = String(row[2] ?? "").trim();
      order_id = String(row[3] ?? "").trim();
      sku = String(row[4] ?? "").trim();
      description = String(row[5] ?? "").trim();
      qty = toNum(row[6]);
      marketplace = String(row[7] ?? "").trim() || null;
      accountType = String(row[8] ?? "").trim() || null;
      fulfillmentId = accountType;
      taxCollectionModel = null;
      productSales = decMoney(row[13]);
      productSalesTax = decMoney(row[14]);
      shippingCredits = decMoney(row[15]);
      shippingCreditsTax = decMoney(row[16]);
      giftWrapCredits = decMoney(row[17]);
      giftWrapCreditsTax = decMoney(row[18]);
      promotionalRebates = decMoney(row[19]);
      promotionalRebatesTax = decMoney(row[20]);
      marketplaceWithheldTax = decMoney(row[21]);
      sellingFees = decMoney(row[22]);
      fbaFees = decMoney(row[23]);
      otherTransactionFees = decMoney(row[24]);
      other = decMoney(row[25]);
      total = decMoney(row[26]);
      transactionStatus = String(row[27] ?? "").trim() || null;
      transactionReleaseDatetime = null;
    } else {
      posted = String(get(row, iDate)).trim();
      settlement_id = String(get(row, iSettle)).trim();
      line_type = String(get(row, iType)).trim();
      order_id = String(get(row, iOrder)).trim();
      sku = String(get(row, iSku)).trim();
      description = String(get(row, iDesc)).trim();
      qty = toNum(get(row, iQty));
      marketplace = String(get(row, iMkt)).trim() || null;
      accountType = String(get(row, iAcct)).trim() || null;
      fulfillmentId = String(get(row, iFul)).trim() || null;
      taxCollectionModel = String(get(row, iTaxModel)).trim() || null;
      productSales = decMoney(get(row, iProdSales));
      productSalesTax = decMoney(get(row, iProdTax));
      shippingCredits = decMoney(get(row, iShipCred));
      shippingCreditsTax = decMoney(get(row, iShipCredTax));
      giftWrapCredits = decMoney(get(row, iGift));
      giftWrapCreditsTax = decMoney(get(row, iGiftTax));
      promotionalRebates = decMoney(get(row, iPromo));
      promotionalRebatesTax = decMoney(get(row, iPromoTax));
      marketplaceWithheldTax = decMoney(get(row, iWithheld));
      sellingFees = decMoney(get(row, iSellFee));
      fbaFees = decMoney(get(row, iFba));
      otherTransactionFees = decMoney(get(row, iOtherFees));
      other = decMoney(get(row, iOtherAmt));
      total = decMoney(get(row, iTotal));
      transactionStatus = String(get(row, iStatus)).trim() || null;
      transactionReleaseDatetime = String(get(row, iRelease)).trim() || null;
    }

    if (!posted && !sku && !description && !order_id && !settlement_id && !line_type)
      continue;

    rows.push({
      postedDatetime: posted || null,
      settlementId: settlement_id || null,
      lineType: line_type || null,
      orderId: order_id || null,
      sku: sku || null,
      description: description || null,
      quantity: qty,
      marketplace,
      accountType,
      fulfillmentId,
      taxCollectionModel,
      productSales,
      productSalesTax,
      shippingCredits,
      shippingCreditsTax,
      giftWrapCredits,
      giftWrapCreditsTax,
      promotionalRebates,
      promotionalRebatesTax,
      marketplaceWithheldTax,
      sellingFees,
      fbaFees,
      otherTransactionFees,
      other,
      total,
      transactionStatus,
      transactionReleaseDatetime,
    });
  }

  let ins = 0;
  let sk = 0;
  for (const r of rows) {
    const settlementId = r.settlementId ?? "";
    const orderId = r.orderId ?? "";
    const sku = r.sku ?? "";
    const lineType = r.lineType ?? "";
    const postedDatetime = r.postedDatetime ?? "";
    const existed = await tx.paymentRepository.findFirst({
      where: {
        settlementId,
        orderId,
        sku,
        lineType,
        postedDatetime,
      },
    });
    await tx.$executeRaw`
      INSERT INTO "payment_repository" (
        "id", "postedDatetime", "settlementId", "lineType", "orderId", "sku", "description", "quantity",
        "marketplace", "accountType", "fulfillmentId", "taxCollectionModel",
        "productSales", "productSalesTax", "shippingCredits", "shippingCreditsTax",
        "giftWrapCredits", "giftWrapCreditsTax", "promotionalRebates", "promotionalRebatesTax",
        "marketplaceWithheldTax", "sellingFees", "fbaFees", "otherTransactionFees", "other", "total",
        "transactionStatus", "transactionReleaseDatetime", "store",
        "uploadedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${postedDatetime},
        ${settlementId},
        ${lineType},
        ${orderId},
        ${sku},
        ${r.description},
        ${r.quantity},
        ${r.marketplace},
        ${r.accountType},
        ${r.fulfillmentId},
        ${r.taxCollectionModel},
        ${rawDec(r.productSales)},
        ${rawDec(r.productSalesTax)},
        ${rawDec(r.shippingCredits)},
        ${rawDec(r.shippingCreditsTax)},
        ${rawDec(r.giftWrapCredits)},
        ${rawDec(r.giftWrapCreditsTax)},
        ${rawDec(r.promotionalRebates)},
        ${rawDec(r.promotionalRebatesTax)},
        ${rawDec(r.marketplaceWithheldTax)},
        ${rawDec(r.sellingFees)},
        ${rawDec(r.fbaFees)},
        ${rawDec(r.otherTransactionFees)},
        ${rawDec(r.other)},
        ${rawDec(r.total)},
        ${r.transactionStatus},
        ${r.transactionReleaseDatetime},
        NULL,
        ${batchAt},
        ${batchAt},
        ${batchAt}
      )
      ON CONFLICT ("settlementId", "orderId", "sku", "lineType", "postedDatetime") DO UPDATE SET
        "description" = EXCLUDED."description",
        "quantity" = EXCLUDED."quantity",
        "marketplace" = EXCLUDED."marketplace",
        "accountType" = EXCLUDED."accountType",
        "fulfillmentId" = EXCLUDED."fulfillmentId",
        "taxCollectionModel" = EXCLUDED."taxCollectionModel",
        "productSales" = EXCLUDED."productSales",
        "productSalesTax" = EXCLUDED."productSalesTax",
        "shippingCredits" = EXCLUDED."shippingCredits",
        "shippingCreditsTax" = EXCLUDED."shippingCreditsTax",
        "giftWrapCredits" = EXCLUDED."giftWrapCredits",
        "giftWrapCreditsTax" = EXCLUDED."giftWrapCreditsTax",
        "promotionalRebates" = EXCLUDED."promotionalRebates",
        "promotionalRebatesTax" = EXCLUDED."promotionalRebatesTax",
        "marketplaceWithheldTax" = EXCLUDED."marketplaceWithheldTax",
        "sellingFees" = EXCLUDED."sellingFees",
        "fbaFees" = EXCLUDED."fbaFees",
        "otherTransactionFees" = EXCLUDED."otherTransactionFees",
        "other" = EXCLUDED."other",
        "total" = EXCLUDED."total",
        "transactionStatus" = EXCLUDED."transactionStatus",
        "transactionReleaseDatetime" = EXCLUDED."transactionReleaseDatetime",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    if (existed) sk += 1;
    else ins += 1;
  }
  return { totalRows: rows.length, rowsInserted: ins, rowsSkipped: sk };
}

async function processRemovalShipments(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "").toLowerCase().trim().replace(/['"]/g, ""),
  );
  if (!hdr.some((c) => c.includes("tracking"))) {
    throw new Error(
      'Not Removal Shipments — expected a "tracking-number" style column.',
    );
  }

  const ci = {
    request_date: hdr.findIndex(
      (c) => c.includes("request-date") || c === "request date",
    ),
    order_id: hdr.findIndex(
      (c) => c.includes("order-id") || c === "order id",
    ),
    shipment_date: hdr.findIndex(
      (c) => c.includes("shipment-date") || c === "shipment date",
    ),
    msku: hdr.findIndex((c) => c === "sku"),
    fnsku: hdr.findIndex((c) => c === "fnsku"),
    disposition: hdr.findIndex((c) => c.includes("disposition")),
    shipped_qty: hdr.findIndex(
      (c) =>
        c.includes("shipped-quantity") || c.includes("shipped quantity"),
    ),
    carrier: hdr.findIndex((c) => c === "carrier"),
    tracking: hdr.findIndex(
      (c) =>
        c.includes("tracking-number") || c.includes("tracking number"),
    ),
    order_type: hdr.findIndex(
      (c) =>
        c.includes("removal-order-type") || c.includes("removal order type"),
    ),
  };

  const dataRows = allRows.slice(1).filter((r) => {
    const oi =
      ci.order_id >= 0 ? r[ci.order_id] : r[1];
    return oi && String(oi).trim();
  });

  let ins = 0;
  let sk = 0;
  let bad = 0;
  for (const row of dataRows) {
    const orderId =
      ci.order_id >= 0
        ? String(row[ci.order_id] ?? "").trim()
        : String(row[1] ?? "").trim();
    const fnsku =
      ci.fnsku >= 0 ? String(row[ci.fnsku] ?? "").trim() : "";
    const tracking =
      ci.tracking >= 0 ? String(row[ci.tracking] ?? "").trim() : "";
    if (!orderId || !fnsku || !tracking) {
      bad += 1;
      continue;
    }

    const existed = await tx.removalShipment.findFirst({
      where: { orderId, fnsku, trackingNumber: tracking },
    });
    const requestDate =
      ci.request_date >= 0 ? toDate(row[ci.request_date]) : null;
    const shipmentDate =
      ci.shipment_date >= 0 ? toDate(row[ci.shipment_date]) : null;
    const mskuRow =
      ci.msku >= 0
        ? String(row[ci.msku] ?? "").trim() || null
        : null;
    const dispositionRow =
      ci.disposition >= 0
        ? String(row[ci.disposition] ?? "").trim() || null
        : null;
    const shippedQty =
      ci.shipped_qty >= 0 ? toNum(row[ci.shipped_qty]) : 0;
    const carrierRow =
      ci.carrier >= 0
        ? String(row[ci.carrier] ?? "").trim() || null
        : null;
    const removalOrderTypeRow =
      ci.order_type >= 0
        ? String(row[ci.order_type] ?? "").trim() || null
        : null;

    await tx.$executeRaw`
      INSERT INTO "removal_shipments" (
        "id", "orderId", "requestDate", "shipmentDate", "msku", "fnsku", "disposition",
        "shippedQty", "carrier", "trackingNumber", "removalOrderType", "store",
        "uploadedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${orderId},
        ${requestDate},
        ${shipmentDate},
        ${mskuRow},
        ${fnsku},
        ${dispositionRow},
        ${shippedQty},
        ${carrierRow},
        ${tracking},
        ${removalOrderTypeRow},
        NULL,
        ${batchAt},
        ${batchAt},
        ${batchAt}
      )
      ON CONFLICT ("orderId", "fnsku", "trackingNumber") DO UPDATE SET
        "requestDate" = EXCLUDED."requestDate",
        "shipmentDate" = EXCLUDED."shipmentDate",
        "msku" = EXCLUDED."msku",
        "disposition" = EXCLUDED."disposition",
        "shippedQty" = EXCLUDED."shippedQty",
        "carrier" = EXCLUDED."carrier",
        "removalOrderType" = EXCLUDED."removalOrderType",
        "uploadedAt" = EXCLUDED."uploadedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    if (existed) sk += 1;
    else ins += 1;
  }

  return {
    totalRows: dataRows.length,
    rowsInserted: ins,
    rowsSkipped: sk + bad,
  };
}

// ============================================================
// Settlement Report (Task 11 / Addendum)
// ============================================================

async function processSettlementReport(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/﻿/g, ""),
  );
  const findCol = (...terms: string[]) => {
    for (const t of terms) {
      const tl = t.toLowerCase();
      const i = hdr.findIndex((h) => h.includes(tl));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iSettleId = findCol("settlement-id", "settlement id");
  const iAmtType = findCol("amount-type", "amount type");
  const iAmtDesc = findCol("amount-description", "amount description");

  if (iSettleId === -1 && iAmtType === -1 && iAmtDesc === -1) {
    throw new Error("Not a Settlement Report — wrong file format.");
  }

  const iStart = findCol("settlement-start-date", "settlement start");
  const iEnd = findCol("settlement-end-date", "settlement end");
  const iDeposit = findCol("deposit-date", "deposit date");
  const iTotalAmt = findCol("total-amount", "total amount");
  const iCurrency = hdr.findIndex((h) => h === "currency");
  const iTxType = findCol("transaction-type", "transaction type");
  const iOrder = findCol("order-id", "order id");
  const iMerchOrder = findCol("merchant-order-id", "merchant order id");
  const iAdj = findCol("adjustment-id", "adjustment id");
  const iShip = findCol("shipment-id", "shipment id");
  const iMkt = findCol("marketplace-name", "marketplace name");
  const iAmount = hdr.findIndex((h) => h === "amount");
  const iFeeType = findCol("fee-type", "fee type");
  const iFeeDesc = findCol("fee-description", "fee description");
  const iFeeAmt = findCol("fee-amount", "fee amount");
  const iSku = hdr.findIndex((h) => h === "sku");
  const iQty = findCol("quantity-purchased", "quantity purchased");
  const iPromo = findCol("promotion-id", "promotion id");
  const iOIC = findCol("order-item-code", "order item code");
  const iPosted = hdr.findIndex((h) => h === "posted-date" || h === "posted date");
  const iPostedDt = findCol("posted-date-time", "posted date-time", "posted date time");

  const get = (row: string[], idx: number) =>
    idx === -1 ? "" : String(row[idx] ?? "");
  const num = (s: string): number | null => {
    const t = s.replace(/,/g, "").trim();
    if (!t) return null;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? n : null;
  };
  const intOrNull = (s: string): number | null => {
    const t = s.replace(/,/g, "").trim();
    if (!t) return null;
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  };
  const strOrNull = (s: string): string | null => {
    const t = s.trim();
    return t ? t : null;
  };

  const dataRows = allRows
    .slice(1)
    .filter((r) => r && r.some((c) => String(c ?? "").trim()));

  const records: Prisma.SettlementReportCreateManyInput[] = [];
  for (const row of dataRows) {
    records.push({
      settlementId: strOrNull(get(row, iSettleId)),
      settlementStartDate: strOrNull(get(row, iStart)),
      settlementEndDate: strOrNull(get(row, iEnd)),
      depositDate: strOrNull(get(row, iDeposit)),
      totalAmount: num(get(row, iTotalAmt)),
      currency: strOrNull(get(row, iCurrency)),
      transactionType: strOrNull(get(row, iTxType)),
      orderId: strOrNull(get(row, iOrder)),
      merchantOrderId: strOrNull(get(row, iMerchOrder)),
      adjustmentId: strOrNull(get(row, iAdj)),
      shipmentId: strOrNull(get(row, iShip)),
      marketplaceName: strOrNull(get(row, iMkt)),
      amountType: strOrNull(get(row, iAmtType)),
      amountDescription: strOrNull(get(row, iAmtDesc)),
      amount: num(get(row, iAmount)),
      sku: strOrNull(get(row, iSku)),
      quantityPurchased: intOrNull(get(row, iQty)),
      promotionId: strOrNull(get(row, iPromo)),
      orderItemCode: strOrNull(get(row, iOIC)),
      postedDate: strOrNull(get(row, iPosted)),
      postedDateTime: strOrNull(get(row, iPostedDt)),
      uploadedAt: batchAt,
    });
  }

  // Suppress unused locals for fee-* columns kept for future schema expansion.
  void iFeeType;
  void iFeeDesc;
  void iFeeAmt;

  if (records.length === 0) {
    return { totalRows: 0, rowsInserted: 0, rowsSkipped: 0 };
  }

  // Settlement Report is append-only; no unique key, so just createMany.
  await tx.settlementReport.createMany({ data: records });

  return {
    totalRows: dataRows.length,
    rowsInserted: records.length,
    rowsSkipped: dataRows.length - records.length,
  };
}
