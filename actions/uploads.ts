"use server";

import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  REPORT_TYPE_VALUES,
  SETTLEMENT_ACCOUNT_TYPE_LABELS,
  isSettlementAccountType,
  isSettlementStore,
  type ReportTypeValue,
  type SettlementAccountType,
  type SettlementStore,
  type UploadFileResult,
  type UploadHistoryRow,
  type UploadMutationResult,
  type UploadSummaryRow,
} from "@/lib/upload-report-types";
import { requireAuth } from "@/actions/auth";
import { syncInboundSnapshotsForShipmentIds } from "@/actions/inbound-recon";
import {
  authzErrorToMutationResult,
  PermissionLevel,
  PermissionModule,
  requireLevel,
} from "@/lib/auth/rbac";

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
    invAdjAgg,
    settlementAgg,
    paymentRepoRows,
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
    prisma.shippedToFba.aggregate({ _max: { shipDate: true }, _min: { shipDate: true } }),
    prisma.salesData.aggregate({ _max: { saleDate: true }, _min: { saleDate: true } }),
    prisma.fbaReceipt.aggregate({ _max: { receiptDate: true }, _min: { receiptDate: true } }),
    prisma.customerReturn.aggregate({ _max: { returnDate: true }, _min: { returnDate: true } }),
    prisma.reimbursement.aggregate({ _max: { approvalDate: true }, _min: { approvalDate: true } }),
    prisma.fcTransfer.aggregate({ _max: { transferDate: true }, _min: { transferDate: true } }),
    prisma.replacement.aggregate({ _max: { shipmentDate: true }, _min: { shipmentDate: true } }),
    prisma.gnrReport.aggregate({ _max: { reportDate: true }, _min: { reportDate: true } }),
    prisma.fbaRemoval.aggregate({ _max: { requestDate: true }, _min: { requestDate: true } }),
    prisma.removalShipment.aggregate({ _max: { shipmentDate: true }, _min: { shipmentDate: true } }),
    prisma.shipmentStatus.aggregate({ _max: { lastUpdated: true }, _min: { lastUpdated: true } }),
    prisma.fbaSummary.aggregate({ _max: { summaryDate: true }, _min: { summaryDate: true } }),
    prisma.inventoryAdjustment.aggregate({ _max: { adjDate: true }, _min: { adjDate: true } }),
    prisma.settlementReport.aggregate({ _max: { postedDate: true }, _min: { postedDate: true } }),
    prisma.paymentRepository.findMany({ select: { postedDatetime: true } }),
  ]);

  let paymentMin: Date | null = null;
  let paymentMax: Date | null = null;
  for (const r of paymentRepoRows) {
    const d = toDate(r.postedDatetime);
    if (!d) continue;
    if (!paymentMin || d < paymentMin) paymentMin = d;
    if (!paymentMax || d > paymentMax) paymentMax = d;
  }

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
    payment_repository: paymentMax,
    adjustments: null,
    inventory_adjustments: invAdjAgg._max.adjDate,
    settlement_report: settlementAgg._max.postedDate,
  };

  const oldestDataDates: Record<string, Date | null> = {
    shipped_to_fba: shippedAgg._min.shipDate,
    sales_data: salesAgg._min.saleDate,
    fba_receipts: receiptsAgg._min.receiptDate,
    customer_returns: returnsAgg._min.returnDate,
    reimbursements: reimbAgg._min.approvalDate,
    fc_transfers: fcAgg._min.transferDate,
    replacements: replAgg._min.shipmentDate,
    gnr_report: gnrAgg._min.reportDate,
    fba_removals: removalsAgg._min.requestDate,
    removal_shipments: remShipAgg._min.shipmentDate,
    shipment_status: shipStatusAgg._min.lastUpdated,
    fba_summary: fbaSummAgg._min.summaryDate,
    payment_repository: paymentMin,
    adjustments: null,
    inventory_adjustments: invAdjAgg._min.adjDate,
    settlement_report: settlementAgg._min.postedDate,
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
      oldestInFile: oldestDataDates[rt] ?? null,
    };
  });
}


export async function setUploadLocked(
  id: string,
  isLocked: boolean,
): Promise<UploadMutationResult> {
  // Lock/unlock is an administrative gate on uploaded reports — protects a
  // batch from being deleted. Same risk level as delete itself, so FULL is
  // required. VENDOR (EDIT on REPORTS) cannot toggle it.
  try {
    await requireLevel(PermissionModule.REPORTS, PermissionLevel.FULL);
  } catch (e) {
    return authzErrorToMutationResult(e);
  }
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
    await requireLevel(PermissionModule.REPORTS, PermissionLevel.FULL);
  } catch (e) {
    return authzErrorToMutationResult(e);
  }
  const uf = await prisma.uploadedFile.findUnique({ where: { id } });
  if (!uf) return { ok: false, error: "Upload not found." };
  if (uf.isLocked) {
    return { ok: false, error: "This upload is locked and cannot be deleted." };
  }

  const at = uf.uploadedAt;
  const rt = uf.reportType as ReportTypeValue;
  // Short-term: match rows by exact uploadedAt timestamp.
  // Risk: two uploads of the same report type in the same millisecond
  // would share a timestamp. TODO: add batchId UUID column to all fact
  // tables, stamp at upload time, and delete by batchId.
  const where = { uploadedAt: at };

  try {
    await prisma.$transaction(async (tx) => {
      switch (rt) {
        case "shipped_to_fba":
          await tx.shippedToFba.deleteMany({ where });
          break;
        case "sales_data":
          await tx.salesData.deleteMany({ where });
          break;
        case "fba_receipts":
          await tx.fbaReceipt.deleteMany({ where });
          break;
        case "customer_returns":
          await tx.customerReturn.deleteMany({ where });
          break;
        case "reimbursements":
          await tx.reimbursement.deleteMany({ where });
          break;
        case "fba_removals":
          await tx.fbaRemoval.deleteMany({ where });
          break;
        case "fc_transfers":
          await tx.fcTransfer.deleteMany({ where });
          break;
        case "shipment_status":
          await tx.shipmentStatus.deleteMany({ where });
          break;
        case "fba_summary":
          await tx.fbaSummary.deleteMany({ where });
          break;
        case "replacements":
          await tx.replacement.deleteMany({ where });
          break;
        case "adjustments":
          await tx.adjustment.deleteMany({ where });
          break;
        case "inventory_adjustments":
          await tx.inventoryAdjustment.deleteMany({ where });
          break;
        case "gnr_report":
          await tx.gnrReport.deleteMany({ where });
          break;
        case "payment_repository":
          await tx.paymentRepository.deleteMany({ where });
          break;
        case "removal_shipments":
          await tx.removalShipment.deleteMany({ where });
          break;
        case "settlement_report":
          await tx.settlementReport.deleteMany({ where });
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

const MAX_BYTES = 100 * 1024 * 1024;

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

  // Settlement Report requires two extra selectors on the form: Amazon
  // account type (Standard / Invoiced) and store (USA / CA). Validate
  // before opening the transaction.
  let settlementAccountType: SettlementAccountType | undefined;
  let settlementStore: SettlementStore | undefined;
  if (reportType === "settlement_report") {
    const at = String(formData.get("account_type") ?? "").trim();
    const st = String(formData.get("store") ?? "").trim();
    if (!at || !st) {
      return {
        ok: false,
        error: "Settlement Report requires Account Type and Store.",
      };
    }
    if (!isSettlementAccountType(at)) {
      return { ok: false, error: `Unknown account type: ${at}` };
    }
    if (!isSettlementStore(st)) {
      return { ok: false, error: `Unknown store: ${st}` };
    }
    settlementAccountType = at;
    settlementStore = st;
  }
  if (file.size === 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File is too large (max 100 MB)." };
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
                return processShipped(tx, rows, batchAt, file.name);
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
              case "inventory_adjustments":
                return processInventoryAdjustments(tx, rows, batchAt);
              case "gnr_report":
                return processGnr(tx, rows, batchAt);
              case "payment_repository":
                return processPaymentRepository(tx, rows, batchAt);
              case "removal_shipments":
                return processRemovalShipments(tx, rows, batchAt);
              case "settlement_report":
                return processSettlementReport(tx, rows, batchAt, {
                  accountType: settlementAccountType!,
                  store: settlementStore!,
                });
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

// Real Amazon CSVs are sometimes cp1252-encoded (en-dashes 0x96, smart quotes
// 0x91-0x94 in titles). Strict utf-8 produces U+FFFD replacement chars which
// then break downstream parsing or display. Try utf-8 first; if any byte in
// the 0x80-0x9F window is present (the cp1252-only range that is invalid in
// utf-8), decode as latin1 instead. rowHash logic is unchanged \u2014 values that
// previously contained replacement chars will hash differently going forward.
function decodeTolerant(buf: Buffer): string {
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b >= 0x80 && b <= 0x9f) {
      return buf.toString("latin1");
    }
  }
  return buf.toString("utf8");
}

function parseSpreadsheet(filename: string, buf: Buffer): string[][] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = decodeTolerant(buf).replace(/^\uFEFF/, "");
    const parsed = parse(text, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    }) as string[][];
    return parsed.map((row) =>
      row.map((c) => String(c ?? "").replace(/^"|"$/g, "").trim()),
    );
  }
  if (lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    return decodeTolerant(buf)
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

// Batch large IN-clauses to stay under Postgres bind-param limit (~32767).
async function fetchExistingHashes(
  hashes: string[],
  finder: (chunk: string[]) => Promise<{ rowHash: string | null }[]>,
): Promise<Set<string>> {
  const out = new Set<string>();
  const CHUNK = 1000;
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const chunk = hashes.slice(i, i + CHUNK);
    const rows = await finder(chunk);
    for (const r of rows) if (r.rowHash) out.add(r.rowHash);
  }
  return out;
}

/* ─── Processors (legacy server.js behaviour) ─── */

async function processShipped(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
  filename: string,
): Promise<ProcessOutcome> {
  const lower = filename.toLowerCase();
  const isTsv = lower.endsWith(".tsv") || lower.endsWith(".txt");

  type Entry = {
    msku: string;
    title: string;
    asin: string;
    fnsku: string;
    qty: number;
    shipDate: Date | null;
    shipmentId: string;
  };

  const map = new Map<string, Entry>();
  const shipmentsTouched = new Set<string>();
  let nullShipmentTouched = false;

  if (isTsv) {
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

    for (const row of dataRows) {
      const msku = String(row[0] ?? "").trim();
      const title = String(row[1] ?? "").trim();
      const asin = String(row[2] ?? "").trim();
      const fnsku = String(row[3] ?? "").trim();
      const qty = toNum(row[9]);
      if (!msku) continue;
      const key = `${shipmentId}|${msku}`;
      const existing = map.get(key);
      if (existing) {
        existing.qty += qty;
      } else {
        map.set(key, { msku, title, asin, fnsku, qty, shipDate, shipmentId });
      }
    }

    if (shipmentId) shipmentsTouched.add(shipmentId);
    else nullShipmentTouched = true;
  } else {
    const header = (allRows[0] ?? []).map((c) =>
      String(c ?? "").toLowerCase().trim(),
    );
    const findCol = (...names: string[]) =>
      header.findIndex((h) => names.some((n) => h === n));
    const idx = {
      date: findCol("date"),
      shipmentId: findCol("shipment id", "shipment-id", "shipmentid"),
      msku: findCol("merchant sku", "merchant-sku", "msku"),
      title: findCol("title"),
      asin: findCol("asin"),
      fnsku: findCol("fnsku"),
      shipped: findCol("shipped", "quantity", "qty", "shipped quantity"),
    };
    if (idx.msku === -1 || idx.shipped === -1) {
      throw new Error(
        'Not a valid Shipped to FBA report — need "Merchant SKU" and "Shipped" columns.',
      );
    }

    for (const row of allRows.slice(1)) {
      const msku = String(row[idx.msku] ?? "").trim();
      if (!msku) continue;
      const title = idx.title >= 0 ? String(row[idx.title] ?? "").trim() : "";
      const asin = idx.asin >= 0 ? String(row[idx.asin] ?? "").trim() : "";
      const fnsku = idx.fnsku >= 0 ? String(row[idx.fnsku] ?? "").trim() : "";
      const shipmentId =
        idx.shipmentId >= 0
          ? String(row[idx.shipmentId] ?? "").trim()
          : "";
      const shipDate = idx.date >= 0 ? toDate(row[idx.date]) : null;
      const qty = toNum(row[idx.shipped]);

      const key = `${shipmentId}|${msku}`;
      const existing = map.get(key);
      if (existing) {
        existing.qty += qty;
        if (!existing.shipDate && shipDate) existing.shipDate = shipDate;
      } else {
        map.set(key, { msku, title, asin, fnsku, qty, shipDate, shipmentId });
      }

      if (shipmentId) shipmentsTouched.add(shipmentId);
      else nullShipmentTouched = true;
    }
  }

  const entries = Array.from(map.values()).filter((e) => e.msku && e.qty > 0);

  const whereOr: Prisma.ShippedToFbaWhereInput[] = [];
  if (shipmentsTouched.size)
    whereOr.push({ shipmentId: { in: Array.from(shipmentsTouched) } });
  if (nullShipmentTouched) whereOr.push({ shipmentId: null });

  if (whereOr.length) {
    const priorRows = await tx.shippedToFba.findMany({
      where: { OR: whereOr },
      select: { uploadedAt: true },
    });
    const priorTimes = Array.from(
      new Set(priorRows.map((r) => r.uploadedAt.getTime())),
    ).map((t) => new Date(t));

    await tx.shippedToFba.deleteMany({ where: { OR: whereOr } });

    if (priorTimes.length) {
      await tx.uploadedFile.deleteMany({
        where: {
          reportType: "shipped_to_fba",
          uploadedAt: { in: priorTimes },
          isLocked: false,
        },
      });
    }
  }

  if (entries.length) {
    await tx.shippedToFba.createMany({
      data: entries.map((e) => ({
        msku: e.msku,
        title: e.title || null,
        asin: e.asin || null,
        fnsku: e.fnsku || null,
        shipDate: e.shipDate,
        quantity: e.qty,
        shipmentId: e.shipmentId || null,
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

  const hashOf = (r: SaleRow): string => {
    const parts = [
      r.orderId,
      r.fnsku ?? "",
      r.saleDate ? r.saleDate.toISOString() : "",
      r.msku,
      r.asin ?? "",
      r.fc ?? "",
      String(r.quantity),
      r.currency,
      r.productAmount ? r.productAmount.toString() : "",
      r.shippingAmount ? r.shippingAmount.toString() : "",
      r.giftAmount ? r.giftAmount.toString() : "",
      r.shipCity ?? "",
      r.shipState ?? "",
      r.shipPostalCode ?? "",
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  let ins = 0;
  let sk = 0;
  let bad = 0;

  const validRows: { r: SaleRow; hash: string }[] = [];
  for (const r of rows) {
    if (!r.saleDate) {
      bad += 1;
      continue;
    }
    validRows.push({ r, hash: hashOf(r) });
  }

  if (validRows.length > 0) {
    const existingSet = await fetchExistingHashes(
      validRows.map((v) => v.hash),
      (chunk) =>
        tx.salesData.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );

    for (const { r, hash } of validRows) {
      if (existingSet.has(hash)) {
        sk += 1;
        continue;
      }
      await tx.$executeRaw`
        INSERT INTO "sales_data" (
          "id", "msku", "fnsku", "asin", "quantity", "saleDate", "orderId", "currency",
          "productAmount", "shippingAmount", "giftAmount", "fc",
          "shipCity", "shipState", "shipPostalCode", "store", "rowHash",
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
          ${hash},
          ${batchAt},
          ${batchAt},
          ${batchAt}
        )
      `;
      ins += 1;
    }
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

  type RcptRow = {
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
  };

  const dataRows = allRows.slice(1).filter((r) => r[3] && String(r[3]).trim());
  const entries: RcptRow[] = [];
  for (const row of dataRows) {
    const msku = String(row[3] ?? "").trim();
    const fnsku = String(row[1] ?? "").trim();
    if (!fnsku && !msku) continue;
    const date = toDate(row[0]);
    const datetime_raw = String(row[14] ?? "").trim();
    entries.push({
      msku,
      fnsku,
      asin: String(row[2] ?? "").trim(),
      title: String(row[4] ?? "").trim(),
      event_type: String(row[5] ?? "").trim(),
      shipmentId: String(row[6] ?? "").trim(),
      qty: toNum(row[7]),
      fc: String(row[8] ?? "").trim(),
      disposition: String(row[9] ?? "").trim(),
      reason: String(row[10] ?? "").trim(),
      country: row.length > 11 ? String(row[11] ?? "").trim() : "",
      recon_qty: toNum(row[12]),
      unrecon_qty: toNum(row[13]),
      date,
      recv_dt: datetime_raw ? toDate(datetime_raw) : date,
      store: String(row[15] ?? "").replace(/[\r\n]/g, "").trim(),
    });
  }

  const hashOf = (e: RcptRow): string => {
    const parts = [
      e.fnsku, e.msku, e.asin, e.title, e.event_type, e.shipmentId,
      String(e.qty), e.fc, e.disposition, e.reason, e.country,
      String(e.recon_qty), String(e.unrecon_qty),
      e.date ? e.date.toISOString() : "",
      e.recv_dt ? e.recv_dt.toISOString() : "",
      e.store,
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  let ins = 0;
  let sk = 0;
  let bad = 0;
  const valid: { e: RcptRow; hash: string }[] = [];
  for (const e of entries) {
    if (!e.date || !e.fnsku) { bad += 1; continue; }
    valid.push({ e, hash: hashOf(e) });
  }

  if (valid.length > 0) {
    const existingSet = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.fbaReceipt.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );
    for (const { e, hash } of valid) {
      if (existingSet.has(hash)) { sk += 1; continue; }
      await tx.$executeRaw`
        INSERT INTO "fba_receipts" (
          "id", "msku", "title", "asin", "fnsku", "quantity", "receiptDate", "shipmentId",
          "eventType", "fulfillmentCenter", "disposition", "reason", "country",
          "reconciledQty", "unreconciledQty", "receiptDatetime", "store", "rowHash",
          "uploadedAt", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text,
          ${e.msku || null},
          ${e.title || null},
          ${e.asin || null},
          ${e.fnsku || null},
          ${e.qty},
          ${e.date},
          ${e.shipmentId || null},
          ${e.event_type || null},
          ${e.fc || null},
          ${e.disposition || null},
          ${e.reason || null},
          ${e.country || null},
          ${e.recon_qty || 0},
          ${e.unrecon_qty || 0},
          ${e.recv_dt},
          ${e.store || null},
          ${hash},
          ${batchAt},
          ${batchAt},
          ${batchAt}
        )
        ON CONFLICT ("rowHash") DO NOTHING
      `;
      ins += 1;
    }
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

  const hashOf = (r: RetRow): string => {
    const parts = [
      r.orderId ?? "", r.fnsku ?? "", r.returnDate ? r.returnDate.toISOString() : "",
      r.msku, r.asin ?? "", r.title ?? "", String(r.quantity),
      r.disposition ?? "", r.detailedDisposition ?? "", r.reason ?? "",
      r.status ?? "", r.fulfillmentCenter ?? "", r.licensePlateNumber ?? "",
      r.customerComments ?? "",
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  let ins = 0;
  let sk = 0;
  let bad = 0;
  const valid: { r: RetRow; hash: string }[] = [];
  for (const r of rows) {
    if (!r.orderId || !r.fnsku || !r.returnDate) { bad += 1; continue; }
    valid.push({ r, hash: hashOf(r) });
  }

  if (valid.length > 0) {
    const existingSet = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.customerReturn.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );
    for (const { r, hash } of valid) {
      if (existingSet.has(hash)) { sk += 1; continue; }
      await tx.$executeRaw`
        INSERT INTO "customer_returns" (
          "id", "msku", "asin", "fnsku", "title", "quantity", "disposition", "detailedDisposition",
          "reason", "status", "returnDate", "orderId", "fulfillmentCenter", "licensePlateNumber",
          "customerComments", "store", "rowHash", "uploadedAt", "createdAt", "updatedAt"
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
          ${hash},
          ${batchAt},
          ${batchAt},
          ${batchAt}
        )
      `;
      ins += 1;
    }
  }

  return {
    totalRows: rows.length,
    rowsInserted: ins,
    rowsSkipped: sk + bad,
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

  const hashOf = (r: RRow): string => {
    const parts = [
      r.reimbursementId ?? "", r.msku, r.fnsku ?? "",
      r.approvalDate ? r.approvalDate.toISOString() : "",
      r.caseId ?? "", r.amazonOrderId ?? "", r.reason ?? "",
      r.asin ?? "", r.title ?? "", r.conditionVal ?? "", r.currency,
      r.amountPerUnit ? r.amountPerUnit.toString() : "",
      r.amount ? r.amount.toString() : "",
      String(r.qtyCash), String(r.qtyInventory), String(r.quantity),
      r.originalReimbId ?? "", r.originalReimbType ?? "",
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  let ins = 0;
  let sk = 0;
  let bad = 0;
  const valid: { r: RRow; hash: string }[] = [];
  for (const r of rows) {
    if (!r.reimbursementId) { bad += 1; continue; }
    valid.push({ r, hash: hashOf(r) });
  }

  if (valid.length > 0) {
    const existingSet = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.reimbursement.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );
    for (const { r, hash } of valid) {
      if (existingSet.has(hash)) { sk += 1; continue; }
      await tx.$executeRaw`
        INSERT INTO "reimbursements" (
          "id", "approvalDate", "reimbursementId", "caseId", "amazonOrderId", "reason",
          "msku", "fnsku", "asin", "title", "conditionVal", "currency", "amountPerUnit", "amount",
          "qtyCash", "qtyInventory", "quantity", "originalReimbId", "originalReimbType",
          "store", "rowHash", "uploadedAt", "createdAt", "updatedAt"
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
          ${hash},
          ${batchAt},
          ${batchAt},
          ${batchAt}
        )
      `;
      ins += 1;
    }
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
    requestedQty: number;
    cancelledQty: number;
    disposedQty: number;
    quantity: number;
    inProcessQty: number;
    removalFee: Prisma.Decimal | null;
    currency: string;
  };

  const idx = (...names: string[]): number => {
    for (const n of names) {
      const t = n.toLowerCase().trim();
      const i = hdr.findIndex((h) => h === t);
      if (i !== -1) return i;
    }
    for (const n of names) {
      const t = n.toLowerCase().trim();
      const i = hdr.findIndex((h) => h.includes(t));
      if (i !== -1) return i;
    }
    return -1;
  };

  const cReqDate = idx("request-date", "request date");
  const cOrderId = idx("order-id", "order id");
  const cOrderSrc = idx("order-source", "order source");
  const cOrderType = idx("order-type", "order type");
  const cOrderStatus = idx("order-status", "order status");
  const cLastUpd = idx("last-updated-date", "last-updated", "last updated");
  const cSku = idx("sku", "msku");
  const cFnsku = idx("fnsku");
  const cDisp = idx("disposition");
  const cRequested = idx("requested-quantity", "requested quantity");
  const cCancelled = idx("cancelled-quantity", "cancelled quantity");
  const cDisposed = idx("disposed-quantity", "disposed quantity");
  const cShipped = idx("shipped-quantity", "shipped quantity");
  const cInProc = idx("in-process-quantity", "in process quantity");
  const cFee = idx("removal-fee", "removal fee");
  const cCur = idx("currency");

  const pick = (row: string[], i: number): unknown =>
    i >= 0 ? row[i] : undefined;

  const dataRows = allRows
    .slice(1)
    .filter((r) => cSku >= 0 && r[cSku] && String(r[cSku]).trim());
  const rows = dataRows
    .map((row) => {
      const msku = String(pick(row, cSku) ?? "").trim();
      const fnsku = String(pick(row, cFnsku) ?? "").trim();
      if (!msku && !fnsku) return null;
      return {
        msku: msku || null,
        fnsku: fnsku || null,
        disposition: String(pick(row, cDisp) ?? "").trim() || null,
        orderStatus: String(pick(row, cOrderStatus) ?? "").trim() || null,
        orderId: String(pick(row, cOrderId) ?? "").trim() || null,
        requestDate: toDate(pick(row, cReqDate)),
        orderSource: String(pick(row, cOrderSrc) ?? "").trim() || null,
        orderType: String(pick(row, cOrderType) ?? "").trim() || null,
        lastUpdated: toDate(pick(row, cLastUpd)),
        requestedQty: toNum(pick(row, cRequested)),
        cancelledQty: toNum(pick(row, cCancelled)),
        disposedQty: toNum(pick(row, cDisposed)),
        quantity: toNum(pick(row, cShipped)),
        inProcessQty: toNum(pick(row, cInProc)),
        removalFee: decMoney(pick(row, cFee)),
        currency:
          String(pick(row, cCur) ?? "USD")
            .replace(/[\r\n]/g, "")
            .trim() || "USD",
      };
    })
    .filter(Boolean) as RemRow[];

  const hashOf = (r: RemRow): string => {
    const parts = [
      r.orderId ?? "", r.fnsku ?? "", r.requestDate ? r.requestDate.toISOString() : "",
      r.msku ?? "", r.disposition ?? "", r.orderStatus ?? "",
      r.orderSource ?? "", r.orderType ?? "",
      r.lastUpdated ? r.lastUpdated.toISOString() : "",
      String(r.requestedQty), String(r.cancelledQty), String(r.disposedQty),
      String(r.quantity), String(r.inProcessQty),
      r.removalFee ? r.removalFee.toString() : "",
      r.currency,
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  let ins = 0;
  let sk = 0;
  let bad = 0;
  const valid: { r: RemRow; hash: string }[] = [];
  for (const r of rows) {
    if (!r.orderId || !r.fnsku || !r.requestDate) { bad += 1; continue; }
    valid.push({ r, hash: hashOf(r) });
  }

  if (valid.length > 0) {
    const existingSet = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.fbaRemoval.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );
    for (const { r, hash } of valid) {
      if (existingSet.has(hash)) { sk += 1; continue; }
      await tx.$executeRaw`
        INSERT INTO "fba_removals" (
          "id", "msku", "fnsku", "quantity", "disposition", "orderStatus", "orderId", "requestDate",
          "orderSource", "orderType", "lastUpdated", "requestedQty", "cancelledQty", "disposedQty", "inProcessQty",
          "removalFee", "currency", "store", "rowHash", "uploadedAt", "createdAt", "updatedAt"
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
          ${r.requestedQty},
          ${r.cancelledQty},
          ${r.disposedQty},
          ${r.inProcessQty},
          ${rawDec(r.removalFee)},
          ${r.currency},
          NULL,
          ${hash},
          ${batchAt},
          ${batchAt},
          ${batchAt}
        )
      `;
      ins += 1;
    }
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
  const rows: FtRow[] = [];
  for (const row of dataRows) {
    const msku = String(row[3] ?? "").trim();
    const fnsku = String(row[1] ?? "").trim();
    if (!msku && !fnsku) continue;
    const dt_raw = String(row[14] ?? "").trim();
    const date = toDate(row[0]);
    rows.push({
      msku: msku || null,
      fnsku: fnsku || null,
      asin: String(row[2] ?? "").trim() || null,
      title: String(row[4] ?? "").trim() || null,
      quantity: toNum(row[7]),
      transferDate: date,
      eventType: String(row[5] ?? "").trim() || null,
      referenceId: String(row[6] ?? "").trim() || null,
      fulfillmentCenter: String(row[8] ?? "").trim() || null,
      disposition: String(row[9] ?? "").trim() || null,
      reason: String(row[10] ?? "").trim() || null,
      country: String(row[11] ?? "").trim() || null,
      reconciledQty: toNum(row[12]),
      unreconciledQty: toNum(row[13]),
      transferDatetime: dt_raw ? toDate(dt_raw) : date,
      store: String(row[15] ?? "").replace(/[\r\n]/g, "").trim() || null,
    });
  }

  const hashOf = (r: FtRow): string => {
    const parts = [
      r.fnsku ?? "", r.transferDate ? r.transferDate.toISOString() : "",
      r.referenceId ?? "", r.msku ?? "", r.asin ?? "", r.title ?? "",
      String(r.quantity), r.eventType ?? "", r.fulfillmentCenter ?? "",
      r.disposition ?? "", r.reason ?? "", r.country ?? "",
      String(r.reconciledQty), String(r.unreconciledQty),
      r.transferDatetime ? r.transferDatetime.toISOString() : "",
      r.store ?? "",
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  let ins = 0;
  let sk = 0;
  let bad = 0;
  const valid: { r: FtRow; hash: string }[] = [];
  for (const r of rows) {
    if (!r.transferDate || !r.fnsku) { bad += 1; continue; }
    valid.push({ r, hash: hashOf(r) });
  }

  if (valid.length > 0) {
    const existingSet = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.fcTransfer.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );
    for (const { r, hash } of valid) {
      if (existingSet.has(hash)) { sk += 1; continue; }
      await tx.$executeRaw`
        INSERT INTO "fc_transfers" (
          "id", "msku", "fnsku", "asin", "title", "quantity", "transferDate", "eventType", "referenceId",
          "fulfillmentCenter", "disposition", "reason", "country", "reconciledQty", "unreconciledQty",
          "transferDatetime", "store", "rowHash", "uploadedAt", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text,
          ${r.msku},
          ${r.fnsku},
          ${r.asin},
          ${r.title},
          ${r.quantity},
          ${r.transferDate},
          ${r.eventType},
          ${r.referenceId},
          ${r.fulfillmentCenter},
          ${r.disposition},
          ${r.reason},
          ${r.country},
          ${r.reconciledQty},
          ${r.unreconciledQty},
          ${r.transferDatetime},
          ${r.store},
          ${hash},
          ${batchAt},
          ${batchAt},
          ${batchAt}
        )
      `;
      ins += 1;
    }
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
  const findCol = (...terms: string[]) => {
    for (const t of terms) {
      const i = hdr.findIndex((h) => h.includes(t));
      if (i !== -1) return i;
    }
    return -1;
  };
  const idx = {
    shipmentName: findCol("shipment name", "name"),
    shipmentId: findCol("shipment id", "shipment-id", "shipmentid"),
    createdDate: findCol("created", "create date"),
    lastUpdated: findCol("last updated", "updated"),
    shipTo: findCol("ship to", "destination", "fc"),
    totalSkus: findCol("total skus", "skus", "msku"),
    unitsExpected: findCol("units expected", "expected"),
    unitsLocated: findCol("units located", "located", "received"),
    status: findCol("status"),
  };
  if (idx.shipmentId < 0 || idx.unitsExpected < 0) {
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

  const get = (row: string[], i: number) => (i >= 0 ? row[i] : undefined);

  const dataRows = allRows
    .slice(1)
    .filter((r) => {
      const v = get(r, idx.shipmentId);
      return v && String(v).trim();
    });
  const rows = dataRows
    .map((row) => {
      const shipmentId = String(get(row, idx.shipmentId) ?? "").trim();
      if (!shipmentId) return null;
      return {
        shipmentName: String(get(row, idx.shipmentName) ?? "").trim() || null,
        shipmentId,
        createdDate: toDate(get(row, idx.createdDate)),
        lastUpdated: toDate(get(row, idx.lastUpdated)),
        shipTo: String(get(row, idx.shipTo) ?? "").trim() || null,
        totalSkus: toNum(get(row, idx.totalSkus)),
        unitsExpected: toNum(get(row, idx.unitsExpected)),
        unitsLocated: toNum(get(row, idx.unitsLocated)),
        status: String(get(row, idx.status) ?? "").trim() || null,
      };
    })
    .filter(Boolean) as SRow[];

  const hashOf = (r: SRow): string => {
    const parts = [
      r.shipmentId, r.shipmentName ?? "",
      r.createdDate ? r.createdDate.toISOString() : "",
      r.lastUpdated ? r.lastUpdated.toISOString() : "",
      r.shipTo ?? "", String(r.totalSkus), String(r.unitsExpected),
      String(r.unitsLocated), r.status ?? "",
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  // A shipment is identified by its Shipment ID. Re-uploading the same
  // shipment (with new status / units / dates) must UPDATE the existing
  // row, not insert a duplicate. Collapse incoming rows by shipmentId so a
  // file with the same shipment listed twice keeps the last occurrence.
  const byShipmentId = new Map<string, { r: SRow; hash: string }>();
  for (const r of rows) {
    if (!r.shipmentId) continue;
    byShipmentId.set(r.shipmentId, { r, hash: hashOf(r) });
  }
  const valid = Array.from(byShipmentId.values());

  let ins = 0;
  let upd = 0;
  let sk = 0;

  if (valid.length > 0) {
    // Rows whose full content is unchanged (same rowHash) → skip entirely.
    const existingHashes = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.shipmentStatus.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );

    // For the remaining (new or changed) rows, find which shipmentIds
    // already exist so we know to UPDATE vs INSERT.
    const changed = valid.filter((v) => !existingHashes.has(v.hash));
    const existingIds = new Set<string>();
    if (changed.length > 0) {
      const ids = changed.map((v) => v.r.shipmentId);
      const CHUNK = 1000;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const found = await tx.shipmentStatus.findMany({
          where: { shipmentId: { in: ids.slice(i, i + CHUNK) } },
          select: { shipmentId: true },
        });
        for (const f of found) if (f.shipmentId) existingIds.add(f.shipmentId);
      }
    }

    for (const { r, hash } of valid) {
      if (existingHashes.has(hash)) { sk += 1; continue; }

      if (existingIds.has(r.shipmentId)) {
        // Drop every existing row carrying this shipmentId (collapses any
        // pre-existing duplicates) and reinsert one fresh row with the
        // latest status and figures from the new report.
        await tx.shipmentStatus.deleteMany({
          where: { shipmentId: r.shipmentId },
        });
        await tx.$executeRaw`
          INSERT INTO "shipment_status" (
            "id", "shipmentName", "shipmentId", "createdDate", "lastUpdated", "shipTo",
            "totalSkus", "unitsExpected", "unitsLocated", "status", "store", "rowHash",
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
            ${hash},
            ${batchAt},
            ${batchAt},
            ${batchAt}
          )
        `;
        upd += 1;
      } else {
        await tx.$executeRaw`
          INSERT INTO "shipment_status" (
            "id", "shipmentName", "shipmentId", "createdDate", "lastUpdated", "shipTo",
            "totalSkus", "unitsExpected", "unitsLocated", "status", "store", "rowHash",
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
            ${hash},
            ${batchAt},
            ${batchAt},
            ${batchAt}
          )
        `;
        ins += 1;
      }
    }
  }

  const batchShipmentIds = Array.from(byShipmentId.keys());
  if (batchShipmentIds.length > 0) {
    // Deferred so the surrounding $transaction commits before snapshot
    // lookups run — otherwise the new ShipmentStatus rows aren't visible
    // to a separate Prisma connection yet.
    setImmediate(() => {
      void syncInboundSnapshotsForShipmentIds(batchShipmentIds).catch((err) => {
        console.warn(
          "[upload] inbound snapshot sync after shipment_status upload failed:",
          err instanceof Error ? err.message : err,
        );
      });
    });
  }

  return { totalRows: rows.length, rowsInserted: ins + upd, rowsSkipped: sk };
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
  const iDispos = (() => {
    const exact = hdrSummary.findIndex((h) => h === "disposed");
    if (exact !== -1) return exact;
    return hdrSummary.findIndex(
      (h, idx) => idx !== iDisp && h.startsWith("dispos") && h !== "disposition",
    );
  })();
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
      `Required FBA Summary columns not found (need FNSKU + Ending Warehouse Balance). ` +
        `This looks like Inventory Ledger "Detailed View" — please download the "Summary View" instead ` +
        `(Reports → Fulfillment → Inventory Ledger → View: Summary). ` +
        `First headers found: ${hdrSummary.slice(0, 12).join(", ")}`,
    );
  }

  const get = (row: string[], idx: number) =>
    idx === -1 ? "" : String(row[idx] ?? "");

  const dataRows = allRows
    .slice(1)
    .filter((r) => get(r, iFnsku) && String(get(r, iFnsku)).trim());

  type SumRow = {
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
  };

  const entries: SumRow[] = [];
  for (const row of dataRows) {
    const fnsku = String(get(row, iFnsku)).trim();
    if (!fnsku) continue;
    entries.push({
      msku: String(get(row, iMsku)).trim(),
      fnsku,
      asin: String(get(row, iAsin)).trim(),
      title: String(get(row, iTitle)).trim(),
      disp: String(get(row, iDisp)).trim(),
      starting: toNum(get(row, iStart)),
      in_transit: toNum(get(row, iTransit)),
      receipts: toNum(get(row, iRecpts)),
      shipments: toNum(get(row, iShip)),
      returns: toNum(get(row, iReturn)),
      vendor_ret: toNum(get(row, iVendor)),
      transfer: toNum(get(row, iXfer)),
      found: toNum(get(row, iFound)),
      lost: toNum(get(row, iLost)),
      damaged: toNum(get(row, iDamage)),
      disposed: toNum(get(row, iDispos)),
      other: toNum(get(row, iOther)),
      ending: toNum(get(row, iEnding)),
      unknown: toNum(get(row, iUnknown)),
      location: String(get(row, iLoc)).trim(),
      store: String(get(row, iStore)).replace(/[\r\n]/g, "").trim(),
      date: toDate(get(row, iDate)),
    });
  }

  const hashOf = (e: SumRow): string => {
    const parts = [
      e.msku, e.fnsku, e.disp, e.date ? e.date.toISOString() : "", e.store,
      e.asin, e.title, String(e.ending), String(e.starting), String(e.in_transit),
      String(e.receipts), String(e.shipments), String(e.returns),
      String(e.vendor_ret), String(e.transfer), String(e.found), String(e.lost),
      String(e.damaged), String(e.disposed), String(e.other), String(e.unknown),
      e.location,
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  let ins = 0;
  let sk = 0;
  let bad = 0;
  const valid: { e: SumRow; hash: string }[] = [];
  for (const e of entries) {
    if (!e.date || !e.fnsku) { bad += 1; continue; }
    valid.push({ e, hash: hashOf(e) });
  }

  if (valid.length > 0) {
    const existingSet = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.fbaSummary.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );
    for (const { e, hash } of valid) {
      if (existingSet.has(hash)) { sk += 1; continue; }
      await tx.$executeRaw`
        INSERT INTO "fba_summary" (
          "id", "msku", "fnsku", "asin", "title", "disposition", "endingBalance", "startingBalance",
          "inTransit", "receipts", "customerShipments", "customerReturns", "vendorReturns",
          "warehouseTransfer", "found", "lost", "damaged", "disposedQty", "otherEvents",
          "unknownEvents", "location", "store", "summaryDate", "rowHash",
          "uploadedAt", "createdAt", "updatedAt"
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
          ${hash},
          ${batchAt},
          ${batchAt},
          ${batchAt}
        )
      `;
      ins += 1;
    }
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

  type ReplRow = {
    msku: string;
    orderId: string | null;
    quantity: number;
    asin: string | null;
    fulfillmentCenterId: string | null;
    originalFulfillmentCenterId: string | null;
    replacementReasonCode: string | null;
    replacementOrderId: string | null;
    originalOrderId: string | null;
    shipmentDate: Date | null;
  };

  const dataRows = allRows.slice(1).filter((r) => r.some((c) => String(c ?? "").trim()));
  const rows: ReplRow[] = [];
  for (const row of dataRows) {
    const msku = String(row[idxSku] ?? "").trim();
    if (!msku) continue;
    const replacementOrdId =
      idxReplOrd >= 0 ? String(row[idxReplOrd] ?? "").trim() : "";
    const originalOrdId =
      idxOrigOrd >= 0 ? String(row[idxOrigOrd] ?? "").trim() : "";
    rows.push({
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
      shipmentDate: idxDate >= 0 ? toDate(row[idxDate]) : null,
    });
  }

  const hashOf = (r: ReplRow): string => {
    const parts = [
      r.msku, r.orderId ?? "", r.replacementOrderId ?? "",
      r.originalOrderId ?? "", String(r.quantity), r.asin ?? "",
      r.fulfillmentCenterId ?? "", r.originalFulfillmentCenterId ?? "",
      r.replacementReasonCode ?? "",
      r.shipmentDate ? r.shipmentDate.toISOString() : "",
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  let ins = 0;
  let sk = 0;
  const valid = rows.map((r) => ({ r, hash: hashOf(r) }));

  if (valid.length > 0) {
    const existingSet = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.replacement.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );
    for (const { r, hash } of valid) {
      if (existingSet.has(hash)) { sk += 1; continue; }
      await tx.replacement.create({
        data: {
          msku: r.msku,
          orderId: r.orderId,
          quantity: r.quantity,
          asin: r.asin,
          fulfillmentCenterId: r.fulfillmentCenterId,
          originalFulfillmentCenterId: r.originalFulfillmentCenterId,
          replacementReasonCode: r.replacementReasonCode,
          replacementOrderId: r.replacementOrderId,
          originalOrderId: r.originalOrderId,
          shipmentDate: r.shipmentDate,
          rowHash: hash,
          uploadedAt: batchAt,
        },
      });
      ins += 1;
    }
  }

  return { totalRows: rows.length, rowsInserted: ins, rowsSkipped: sk };
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
    const existed = await tx.adjustment.findFirst({
      where: { msku, store: null },
      select: { id: true },
    });
    if (existed) {
      await tx.adjustment.update({
        where: { id: existed.id },
        data: {
          quantity: { increment: quantity },
          flag: "F",
          uploadedAt: batchAt,
        },
      });
      sk += 1;
    } else {
      await tx.adjustment.create({
        data: {
          msku,
          flag: "F",
          quantity,
          uploadedAt: batchAt,
        },
      });
      ins += 1;
    }
  }
  return { totalRows: entries.length, rowsInserted: ins, rowsSkipped: sk };
}

async function processInventoryAdjustments(
  tx: Tx,
  allRows: string[][],
  batchAt: Date,
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "").toLowerCase().trim().replace(/['"]/g, "").replace(/﻿/g, ""),
  );
  const findCol = (...terms: string[]) => {
    for (const t of terms) {
      const tt = t.toLowerCase();
      const i = hdr.findIndex((h) => h === tt);
      if (i !== -1) return i;
    }
    for (const t of terms) {
      const tt = t.toLowerCase();
      const i = hdr.findIndex((h) => h.includes(tt));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iDate = findCol("date");
  const iFnsku = findCol("fnsku");
  const iAsin = findCol("asin");
  const iMsku = findCol("msku", "merchant sku", "sku");
  const iTitle = findCol("title");
  const iEvent = findCol("event type", "event-type");
  const iRef = findCol("reference id", "reference-id", "referenceid");
  const iQty = findCol("quantity", "qty");
  const iFc = findCol("fulfillment center", "fulfillment-center", "fc");
  const iDisp = findCol("disposition");
  const iReason = findCol("reason");
  const iCountry = findCol("country");
  const iRecon = findCol("reconciled");
  const iUnrecon = findCol("unreconciled");
  const iDt = findCol("date and time", "datetime");
  const iStore = findCol("store");

  if (iFnsku === -1 || iEvent === -1 || iQty === -1) {
    throw new Error(
      'Not Adjustments — need FNSKU, Event Type, and Quantity columns.',
    );
  }
  const sample = allRows.slice(1, 6).map((r) =>
    String(iEvent >= 0 ? r[iEvent] ?? "" : "").trim().toLowerCase(),
  );
  if (!sample.some((v) => v.includes("adjust"))) {
    throw new Error('Not Adjustments — Event Type should be "Adjustment".');
  }

  type ARow = {
    adjDate: Date | null;
    fnsku: string | null;
    asin: string | null;
    msku: string | null;
    title: string | null;
    eventType: string | null;
    referenceId: string | null;
    quantity: number;
    fulfillmentCenter: string | null;
    disposition: string | null;
    reason: string | null;
    country: string | null;
    reconciledQty: number;
    unreconciledQty: number;
    adjDatetime: Date | null;
    store: string | null;
  };

  const get = (row: string[], i: number) => (i >= 0 ? row[i] : undefined);
  const dataRows = allRows
    .slice(1)
    .filter((r) => String(get(r, iFnsku) ?? "").trim());

  const entries: ARow[] = [];
  for (const row of dataRows) {
    const fnsku = String(get(row, iFnsku) ?? "").trim();
    if (!fnsku) continue;
    const date = toDate(get(row, iDate));
    const dtRaw = String(get(row, iDt) ?? "").trim();
    entries.push({
      adjDate: date,
      fnsku: fnsku || null,
      asin: String(get(row, iAsin) ?? "").trim() || null,
      msku: String(get(row, iMsku) ?? "").trim() || null,
      title: String(get(row, iTitle) ?? "").trim() || null,
      eventType: String(get(row, iEvent) ?? "").trim() || null,
      referenceId: String(get(row, iRef) ?? "").trim() || null,
      quantity: toNum(get(row, iQty)),
      fulfillmentCenter: String(get(row, iFc) ?? "").trim() || null,
      disposition: String(get(row, iDisp) ?? "").trim() || null,
      reason: String(get(row, iReason) ?? "").trim() || null,
      country: String(get(row, iCountry) ?? "").trim() || null,
      reconciledQty: toNum(get(row, iRecon)),
      unreconciledQty: toNum(get(row, iUnrecon)),
      adjDatetime: dtRaw ? toDate(dtRaw) : date,
      store: String(get(row, iStore) ?? "").replace(/[\r\n]/g, "").trim() || null,
    });
  }

  const hashOf = (r: ARow): string => {
    const parts = [
      r.referenceId ?? "", r.fnsku ?? "",
      r.adjDate ? r.adjDate.toISOString() : "",
      r.msku ?? "", r.asin ?? "", r.title ?? "", r.eventType ?? "",
      String(r.quantity), r.fulfillmentCenter ?? "",
      r.disposition ?? "", r.reason ?? "", r.country ?? "",
      String(r.reconciledQty), String(r.unreconciledQty),
      r.adjDatetime ? r.adjDatetime.toISOString() : "",
      r.store ?? "",
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  let ins = 0;
  let sk = 0;
  let bad = 0;
  const valid: { r: ARow; hash: string }[] = [];
  for (const r of entries) {
    if (!r.adjDate || !r.fnsku) { bad += 1; continue; }
    valid.push({ r, hash: hashOf(r) });
  }

  if (valid.length > 0) {
    const existingSet = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.inventoryAdjustment.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );
    for (const { r, hash } of valid) {
      if (existingSet.has(hash)) { sk += 1; continue; }
      await tx.$executeRaw`
        INSERT INTO "inventory_adjustments" (
          "id", "adj_date", "fnsku", "asin", "msku", "title", "event_type", "reference_id",
          "quantity", "fulfillment_center", "disposition", "reason", "country",
          "reconciled_qty", "unreconciled_qty", "adj_datetime", "store", "row_hash",
          "uploaded_at", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text,
          ${r.adjDate},
          ${r.fnsku},
          ${r.asin},
          ${r.msku},
          ${r.title},
          ${r.eventType},
          ${r.referenceId},
          ${r.quantity},
          ${r.fulfillmentCenter},
          ${r.disposition},
          ${r.reason},
          ${r.country},
          ${r.reconciledQty},
          ${r.unreconciledQty},
          ${r.adjDatetime},
          ${r.store},
          ${hash},
          ${batchAt},
          ${batchAt},
          ${batchAt}
        )
        ON CONFLICT ("reference_id", "fnsku", "adj_date", "quantity") DO NOTHING
      `;
      ins += 1;
    }
  }

  return { totalRows: entries.length, rowsInserted: ins, rowsSkipped: sk + bad };
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

  const hashOf = (g: GRow): string => {
    const parts = [
      g.orderId, g.fnsku ?? "", g.reportDate ? g.reportDate.toISOString() : "",
      g.lpn ?? "", g.valueRecoveryType ?? "", g.manualOrderItemId ?? "",
      g.msku ?? "", g.asin ?? "", String(g.quantity),
      g.unitStatus ?? "", g.reasonForUnitStatus ?? "",
      g.usedCondition ?? "", g.usedMsku ?? "", g.usedFnsku ?? "",
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  let ins = 0;
  let sk = 0;
  let bad = 0;
  const valid: { g: GRow; hash: string }[] = [];
  for (const g of toSave) {
    if (!g.fnsku || !g.reportDate) { bad += 1; continue; }
    valid.push({ g, hash: hashOf(g) });
  }

  if (valid.length > 0) {
    const existingSet = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.gnrReport.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );
    for (const { g, hash } of valid) {
      if (existingSet.has(hash)) { sk += 1; continue; }
      await tx.$executeRaw`
        INSERT INTO "gnr_report" (
          "id", "reportDate", "orderId", "valueRecoveryType", "lpn", "manualOrderItemId",
          "msku", "fnsku", "asin", "quantity", "unitStatus", "reasonForUnitStatus",
          "usedCondition", "usedMsku", "usedFnsku", "store", "rowHash",
          "uploadedAt", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text,
          ${g.reportDate},
          ${g.orderId},
          ${g.valueRecoveryType},
          ${g.lpn},
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
          ${hash},
          ${batchAt},
          ${batchAt},
          ${batchAt}
        )
      `;
      ins += 1;
    }
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
  // Amazon Unified Transaction CSV has 9 preamble lines before the real
  // header. Template files put the header on row 0. Auto-detect by scanning
  // up to the first 20 rows for a row containing both "date/time" and
  // "settlement id" (canonical Payment Repository markers).
  const normCell = (c: unknown) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/\ufeff/g, "");
  let headerIdx = 0;
  const scanLimit = Math.min(allRows.length, 20);
  for (let i = 0; i < scanLimit; i++) {
    const cells = (allRows[i] ?? []).map(normCell);
    const hasDate = cells.some((h) => h.includes("date/time") || h === "posted date" || h.includes("posted date"));
    const hasSettle = cells.some((h) => h.includes("settlement id") || h.includes("settlement-id"));
    if (hasDate && hasSettle) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx > 0) {
    allRows = allRows.slice(headerIdx);
  }
  const hdr = (allRows[0] ?? []).map(normCell);
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

  // Hard reject — Settlement Report v2 flat-file uses hyphen-separated
  // headers that overlap conceptually ("settlement-id" vs "settlement id",
  // "transaction-type" vs "type"). The previous heuristic gate let those
  // through. Detect the hyphen-form markers explicitly and bounce the file
  // back so it can be uploaded under the right report type.
  const settlementMarkers = [
    "settlement-id",
    "settlement-start-date",
    "settlement-end-date",
    "amount-type",
    "amount-description",
    "posted-date-time",
    "transaction-type",
  ];
  const settlementHits = settlementMarkers.filter((m) => hdr.includes(m));
  if (settlementHits.length >= 3) {
    throw new Error(
      "Not Payment Repository — this looks like an Amazon Settlement Report (flat-file v2). " +
        "Use the Settlement Report upload type instead.",
    );
  }

  // Hard require — Payment Repository canonical headers (space form,
  // lowercase). Reject if any are missing.
  const REQUIRED_PAYMENT = [
    "date/time",
    "settlement id",
    "type",
    "product sales",
    "fba fees",
  ] as const;
  const missingPayment = REQUIRED_PAYMENT.filter((h) => !hdr.includes(h));
  if (missingPayment.length > 0) {
    throw new Error(
      `Not a valid Payment Repository — missing required column(s): ${missingPayment.join(", ")}. ` +
        "Expected the Amazon Unified Transaction CSV (Payment Repository) headers.",
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

  const decToStr = (v: unknown): string => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    if (v instanceof Prisma.Decimal) return v.toString();
    try { return new Prisma.Decimal(v as never).toString(); } catch { return ""; }
  };
  const hashOf = (r: PayRow): string => {
    const parts = [
      r.settlementId ?? "", r.orderId ?? "", r.sku ?? "",
      r.lineType ?? "", r.postedDatetime ?? "",
      r.description ?? "", String(r.quantity ?? 0),
      r.marketplace ?? "", r.accountType ?? "", r.fulfillmentId ?? "",
      r.taxCollectionModel ?? "",
      decToStr(r.productSales), decToStr(r.productSalesTax),
      decToStr(r.shippingCredits), decToStr(r.shippingCreditsTax),
      decToStr(r.giftWrapCredits), decToStr(r.giftWrapCreditsTax),
      decToStr(r.promotionalRebates), decToStr(r.promotionalRebatesTax),
      decToStr(r.marketplaceWithheldTax), decToStr(r.sellingFees),
      decToStr(r.fbaFees), decToStr(r.otherTransactionFees),
      decToStr(r.other), decToStr(r.total),
      r.transactionStatus ?? "", r.transactionReleaseDatetime ?? "",
    ];
    return createHash("sha256").update(parts.join("\x1f")).digest("hex");
  };

  // Canonical-key fingerprint — resilient to whitespace, quoting, date format,
  // and decimal precision differences between re-exports of the same row.
  // rowHash alone misses dupes when Amazon reformats fields between downloads
  // (e.g. "1-Jan-26" vs "2026-01-01 00:00:00", "0" vs "0.00", smart quotes).
  const normStr = (v: string | null | undefined): string =>
    (v ?? "")
      .toString()
      .toLowerCase()
      .replace(/[‘’“”"']/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const normDec = (v: unknown): string => {
    if (v == null) return "";
    try {
      const d = v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v as never);
      return d.toFixed(2);
    } catch {
      return "";
    }
  };
  const normDate = (v: string | null | undefined): string => {
    const s = (v ?? "").toString().trim();
    if (!s) return "";
    const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const yr = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dy = String(d.getUTCDate()).padStart(2, "0");
      return `${yr}-${mo}-${dy}`;
    }
    return normStr(s);
  };
  type CanonRow = Pick<
    PayRow,
    | "settlementId"
    | "lineType"
    | "orderId"
    | "sku"
    | "description"
    | "quantity"
    | "total"
    | "productSales"
    | "postedDatetime"
  >;
  const canonicalKeyOf = (r: CanonRow): string =>
    [
      normStr(r.settlementId),
      normStr(r.lineType),
      normStr(r.orderId),
      normStr(r.sku),
      normStr(r.description),
      String(r.quantity ?? 0),
      normDec(r.total),
      normDec(r.productSales),
      normDate(r.postedDatetime),
    ].join("|");

  let ins = 0;
  let sk = 0;
  const valid = rows.map((r) => ({ r, hash: hashOf(r), key: canonicalKeyOf(r) }));

  if (valid.length > 0) {
    const existingSet = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.paymentRepository.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );

    // Second-pass: fetch any existing rows that share a settlement-id with
    // the incoming batch and build a canonical-key set. Catches re-uploads
    // whose rowHash drifted because of cosmetic field differences.
    const incomingSettleIds = Array.from(
      new Set(
        valid
          .map((v) => v.r.settlementId)
          .filter((s): s is string => typeof s === "string" && s.length > 0),
      ),
    );
    const existingKeySet = new Set<string>();
    if (incomingSettleIds.length > 0) {
      const dbRows = await tx.paymentRepository.findMany({
        where: { settlementId: { in: incomingSettleIds } },
        select: {
          settlementId: true,
          lineType: true,
          orderId: true,
          sku: true,
          description: true,
          quantity: true,
          total: true,
          productSales: true,
          postedDatetime: true,
        },
      });
      for (const e of dbRows) existingKeySet.add(canonicalKeyOf(e));
    }
    // Also dedupe within the incoming batch so an identical row repeated
    // inside a single file is not inserted twice.
    const batchKeySet = new Set<string>();
    const batchHashSet = new Set<string>();

    for (const { r, hash, key } of valid) {
      if (
        existingSet.has(hash) ||
        existingKeySet.has(key) ||
        batchHashSet.has(hash) ||
        batchKeySet.has(key)
      ) {
        sk += 1;
        continue;
      }
      batchHashSet.add(hash);
      batchKeySet.add(key);
      await tx.$executeRaw`
        INSERT INTO "payment_repository" (
          "id", "postedDatetime", "settlementId", "lineType", "orderId", "sku", "description", "quantity",
          "marketplace", "accountType", "fulfillmentId", "taxCollectionModel",
          "productSales", "productSalesTax", "shippingCredits", "shippingCreditsTax",
          "giftWrapCredits", "giftWrapCreditsTax", "promotionalRebates", "promotionalRebatesTax",
          "marketplaceWithheldTax", "sellingFees", "fbaFees", "otherTransactionFees", "other", "total",
          "transactionStatus", "transactionReleaseDatetime", "store", "rowHash",
          "uploadedAt", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text,
          ${r.postedDatetime},
          ${r.settlementId},
          ${r.lineType},
          ${r.orderId},
          ${r.sku},
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
          ${hash},
          ${batchAt},
          ${batchAt},
          ${batchAt}
        )
      `;
      ins += 1;
    }
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

  type RShipRow = {
    orderId: string;
    fnsku: string;
    tracking: string;
    requestDate: Date | null;
    shipmentDate: Date | null;
    msku: string | null;
    disposition: string | null;
    shippedQty: number;
    carrier: string | null;
    removalOrderType: string | null;
  };

  let ins = 0;
  let sk = 0;
  let bad = 0;
  const valid: { r: RShipRow; hash: string }[] = [];
  for (const row of dataRows) {
    const orderId =
      ci.order_id >= 0
        ? String(row[ci.order_id] ?? "").trim()
        : String(row[1] ?? "").trim();
    const fnsku =
      ci.fnsku >= 0 ? String(row[ci.fnsku] ?? "").trim() : "";
    const tracking =
      ci.tracking >= 0 ? String(row[ci.tracking] ?? "").trim() : "";
    if (!orderId || !fnsku || !tracking) { bad += 1; continue; }

    const r: RShipRow = {
      orderId,
      fnsku,
      tracking,
      requestDate: ci.request_date >= 0 ? toDate(row[ci.request_date]) : null,
      shipmentDate: ci.shipment_date >= 0 ? toDate(row[ci.shipment_date]) : null,
      msku: ci.msku >= 0 ? String(row[ci.msku] ?? "").trim() || null : null,
      disposition: ci.disposition >= 0
        ? String(row[ci.disposition] ?? "").trim() || null
        : null,
      shippedQty: ci.shipped_qty >= 0 ? toNum(row[ci.shipped_qty]) : 0,
      carrier: ci.carrier >= 0
        ? String(row[ci.carrier] ?? "").trim() || null
        : null,
      removalOrderType: ci.order_type >= 0
        ? String(row[ci.order_type] ?? "").trim() || null
        : null,
    };
    const parts = [
      r.orderId, r.fnsku, r.tracking,
      r.requestDate ? r.requestDate.toISOString() : "",
      r.shipmentDate ? r.shipmentDate.toISOString() : "",
      r.msku ?? "", r.disposition ?? "", String(r.shippedQty),
      r.carrier ?? "", r.removalOrderType ?? "",
    ];
    const hash = createHash("sha256").update(parts.join("\x1f")).digest("hex");
    valid.push({ r, hash });
  }

  if (valid.length > 0) {
    const existingSet = await fetchExistingHashes(
      valid.map((v) => v.hash),
      (chunk) =>
        tx.removalShipment.findMany({
          where: { rowHash: { in: chunk } },
          select: { rowHash: true },
        }),
    );
    for (const { r, hash } of valid) {
      if (existingSet.has(hash)) { sk += 1; continue; }
      await tx.$executeRaw`
        INSERT INTO "removal_shipments" (
          "id", "orderId", "requestDate", "shipmentDate", "msku", "fnsku", "disposition",
          "shippedQty", "carrier", "trackingNumber", "removalOrderType", "store", "rowHash",
          "uploadedAt", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text,
          ${r.orderId},
          ${r.requestDate},
          ${r.shipmentDate},
          ${r.msku},
          ${r.fnsku},
          ${r.disposition},
          ${r.shippedQty},
          ${r.carrier},
          ${r.tracking},
          ${r.removalOrderType},
          NULL,
          ${hash},
          ${batchAt},
          ${batchAt},
          ${batchAt}
        )
      `;
      ins += 1;
    }
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
  meta: { accountType: SettlementAccountType; store: SettlementStore },
): Promise<ProcessOutcome> {
  const hdr = (allRows[0] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/﻿/g, ""),
  );

  // Strict format gate — Amazon flat-file Settlement Report v2 uses hyphen-
  // separated canonical headers (settlement-id, amount-type, …). Other
  // Amazon exports (Payment Repository, Sales, Reimbursements) reuse some of
  // these tokens with spaces. Match the exact hyphen form so a wrong file
  // can't slip through.
  const REQUIRED = [
    "settlement-id",
    "settlement-start-date",
    "settlement-end-date",
    "total-amount",
    "transaction-type",
    "amount-type",
    "amount-description",
    "amount",
    "posted-date-time",
  ] as const;
  const missing = REQUIRED.filter((h) => !hdr.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `Not a valid Settlement Report — missing required column(s): ${missing.join(", ")}. ` +
        "Expected the Amazon flat-file Settlement Report v2 (hyphen-separated headers).",
    );
  }

  const findCol = (...terms: string[]) => {
    for (const t of terms) {
      const tl = t.toLowerCase();
      const i = hdr.findIndex((h) => h === tl);
      if (i !== -1) return i;
    }
    for (const t of terms) {
      const tl = t.toLowerCase();
      const i = hdr.findIndex((h) => h.includes(tl));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iSettleId = findCol("settlement-id");
  const iAmtType = findCol("amount-type");
  const iAmtDesc = findCol("amount-description");

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
  const dateOrNull = (s: string): Date | null => {
    const t = s.trim();
    if (!t) return null;
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const dataRows = allRows
    .slice(1)
    .filter((r) => r && r.some((c) => String(c ?? "").trim()));

  const records: Prisma.SettlementReportCreateManyInput[] = [];
  for (const row of dataRows) {
    records.push({
      settlementId: strOrNull(get(row, iSettleId)),
      settlementStartDate: dateOrNull(get(row, iStart)),
      settlementEndDate: dateOrNull(get(row, iEnd)),
      depositDate: dateOrNull(get(row, iDeposit)),
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
      postedDate: dateOrNull(get(row, iPosted)),
      postedDateTime: dateOrNull(get(row, iPostedDt)),
      store: meta.store,
      accountType: meta.accountType,
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

  // Dedup against prior uploads. Each Amazon Settlement Report carries a
  // unique settlement-id stamped on every row. If any of the incoming
  // settlement-ids already exist in the DB, skip those rows so re-uploading
  // the same file (or a file overlapping a prior batch) doesn't double-count.
  const incomingIds = Array.from(
    new Set(
      records
        .map((r) => r.settlementId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );

  let existingIds = new Set<string>();
  if (incomingIds.length > 0) {
    // Scope dedup by (settlementId, accountType, store) so the same settlement
    // can be uploaded once per account/store combination.
    const existing = await tx.settlementReport.findMany({
      where: {
        settlementId: { in: incomingIds },
        accountType: meta.accountType,
        store: meta.store,
      },
      select: { settlementId: true },
      distinct: ["settlementId"],
    });
    existingIds = new Set(
      existing
        .map((r) => r.settlementId)
        .filter((v): v is string => typeof v === "string"),
    );
  }

  if (existingIds.size > 0 && existingIds.size === incomingIds.length) {
    const idList = Array.from(existingIds).join(", ");
    const label = SETTLEMENT_ACCOUNT_TYPE_LABELS[meta.accountType];
    throw new Error(
      `Settlement Report already uploaded for ${meta.store}/${label} — settlement-id(s) ${idList} exist. Delete the prior upload first if you need to replace it.`,
    );
  }

  const fresh = records.filter(
    (r) => !r.settlementId || !existingIds.has(r.settlementId),
  );

  if (fresh.length === 0) {
    return {
      totalRows: dataRows.length,
      rowsInserted: 0,
      rowsSkipped: dataRows.length,
    };
  }

  // Settlement Report is append-only; no unique key, so just createMany.
  await tx.settlementReport.createMany({ data: fresh });

  return {
    totalRows: dataRows.length,
    rowsInserted: fresh.length,
    rowsSkipped: dataRows.length - fresh.length,
  };
}
