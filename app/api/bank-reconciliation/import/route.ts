import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

import { persistBankImportBatch } from "@/actions/bank-reconciliation";
import { runClassifierSelfCheck } from "@/lib/bank/classify";
import type { ParsedBankRow } from "@/lib/bank/types";

/**
 * POST /api/bank-reconciliation/import
 * FormData { file: File }
 * Parses a bank statement CSV/XLSX. Header matching is flexible
 * (case-insensitive with aliases). Recognized columns:
 *   Date        — required. Any recognizable date format.
 *   Description — required. Bank memo text used for classification.
 *   Amount      — required. Signed (positive credit, negative debit).
 * Extra columns (e.g. Balance, Type) are ignored.
 * Delegates classification + dedupe to persistBankImportBatch().
 */

const DATE_ALIASES = new Set([
  "date",
  "postingdate",
  "posteddate",
  "transactiondate",
  "txndate",
  "tranDate".toLowerCase(),
]);
const DESC_ALIASES = new Set([
  "description",
  "memo",
  "narrative",
  "details",
  "transactiondescription",
  "trandescription",
]);
const AMOUNT_ALIASES = new Set([
  "amount",
  "amt",
  "signedamount",
  "value",
  "amountusd",
  "usd",
]);

function normHeader(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function decodeTolerant(buf: Buffer): string {
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b >= 0x80 && b <= 0x9f) return buf.toString("latin1");
  }
  return buf.toString("utf8");
}

function parseFile(buf: Buffer, filename: string): string[][] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".xlsm")) {
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    }) as unknown[][];
    return raw.map((row) =>
      (row ?? []).map((c) => String(c ?? "").trim()),
    );
  }
  const text = decodeTolerant(buf).replace(/^﻿/, "");
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

function toDate(val: unknown): Date | null {
  if (val == null || val === "") return null;
  if (val instanceof Date) return val;
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(`${str}T00:00:00.000Z`);
  }
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mdy) {
    const [, mm, dd, yy] = mdy;
    const y = yy.length === 2 ? Number(yy) + (Number(yy) > 50 ? 1900 : 2000) : Number(yy);
    return new Date(
      `${String(y)}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00.000Z`,
    );
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function toSignedAmount(val: unknown): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const raw = String(val).trim();
  // "( $12.34 )" pattern → negative
  const paren = /^\(.*\)$/.test(raw);
  const cleaned = raw
    .replace(/[()]/g, "")
    .replace(/[$,\s]/g, "");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return paren ? -Math.abs(n) : n;
}

function findHeaderIndex(
  headers: string[],
  aliases: Set<string>,
): number {
  for (let i = 0; i < headers.length; i++) {
    if (aliases.has(headers[i])) return i;
  }
  return -1;
}

export async function POST(req: Request) {
  const selfCheck = runClassifierSelfCheck();
  if (!selfCheck.ok) {
    // Fail closed — misclassifying real USA/CA/MX/OTHER rows on import
    // creates silent recon breakage. Boot-time sanity gate.
    return NextResponse.json(
      {
        error:
          "Classifier self-check failed. Refusing to import until classifier bugs are fixed.",
        failures: selfCheck.failures,
      },
      { status: 500 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let rows: string[][];
  try {
    rows = parseFile(buf, file.name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Could not read file: " + msg },
      { status: 400 },
    );
  }

  if (!rows.length) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  const headers = rows[0].map(normHeader);
  const dateIdx = findHeaderIndex(headers, DATE_ALIASES);
  const descIdx = findHeaderIndex(headers, DESC_ALIASES);
  const amtIdx = findHeaderIndex(headers, AMOUNT_ALIASES);

  if (dateIdx < 0 || descIdx < 0 || amtIdx < 0) {
    return NextResponse.json(
      {
        error:
          "Header row must include Date, Description, and Amount columns.",
        seenHeaders: headers,
      },
      { status: 400 },
    );
  }

  const parsedRows: ParsedBankRow[] = [];
  const warnings: string[] = [];
  const dataRows = rows.slice(1).filter((r) => r.some((c) => String(c ?? "").trim()));

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const d = toDate(r[dateIdx]);
    const desc = String(r[descIdx] ?? "").trim();
    const amt = toSignedAmount(r[amtIdx]);
    if (!d) {
      if (warnings.length < 15) {
        warnings.push(`Row ${i + 2}: unparseable date "${r[dateIdx] ?? ""}"`);
      }
      continue;
    }
    if (amt == null) {
      if (warnings.length < 15) {
        warnings.push(`Row ${i + 2}: unparseable amount "${r[amtIdx] ?? ""}"`);
      }
      continue;
    }
    parsedRows.push({
      txnDate: d,
      description: desc || null,
      amountUsd: amt,
    });
  }

  if (parsedRows.length === 0) {
    return NextResponse.json(
      { error: "No parseable rows found.", warnings },
      { status: 400 },
    );
  }

  const importBatchId = `bank-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const result = await persistBankImportBatch(parsedRows, importBatchId);
    return NextResponse.json({
      ...result,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bank-recon import]", msg);
    return NextResponse.json(
      { error: "Import failed: " + msg },
      { status: 500 },
    );
  }
}
