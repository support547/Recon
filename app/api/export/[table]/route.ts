import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * Generic CSV export. Whitelist of tables only; arbitrary names rejected.
 * GET /api/export/<table>?search=<q>&from=<iso>&to=<iso>&limit=10000
 */

type TableSpec = {
  prismaModel: keyof typeof prisma;
  searchFields?: string[];
  dateField?: string;
  /** Optional column allowlist; if omitted, every scalar field is exported. */
  select?: Record<string, true>;
};

const TABLES: Record<string, TableSpec> = {
  reconciliation_summary: {
    prismaModel: "reconciliationSummary",
    searchFields: ["msku", "fnsku", "asin"],
  },
  shipped_to_fba: {
    prismaModel: "shippedToFba",
    searchFields: ["msku", "fnsku", "asin", "title"],
    dateField: "shipDate",
  },
  sales_data: {
    prismaModel: "salesData",
    searchFields: ["msku", "fnsku", "orderId", "asin"],
    dateField: "saleDate",
  },
  fba_receipts: {
    prismaModel: "fbaReceipt",
    searchFields: ["msku", "fnsku", "shipmentId"],
    dateField: "receiptDate",
  },
  customer_returns: {
    prismaModel: "customerReturn",
    searchFields: ["msku", "fnsku", "orderId", "asin"],
    dateField: "returnDate",
  },
  reimbursements: {
    prismaModel: "reimbursement",
    searchFields: ["msku", "fnsku", "amazonOrderId", "caseId", "reason"],
    dateField: "approvalDate",
  },
  fba_removals: {
    prismaModel: "fbaRemoval",
    searchFields: ["msku", "fnsku", "orderId"],
    dateField: "requestDate",
  },
  fc_transfers: {
    prismaModel: "fcTransfer",
    searchFields: ["msku", "fnsku"],
    dateField: "transferDate",
  },
  shipment_status: {
    prismaModel: "shipmentStatus",
    searchFields: ["shipmentId"],
  },
  fba_summary: {
    prismaModel: "fbaSummary",
    searchFields: ["fnsku", "msku", "disposition"],
    dateField: "summaryDate",
  },
  replacements: {
    prismaModel: "replacement",
    searchFields: ["msku", "asin", "orderId", "replacementOrderId"],
    dateField: "shipmentDate",
  },
  adjustments: {
    prismaModel: "adjustment",
    searchFields: ["msku"],
  },
  gnr_report: {
    prismaModel: "gnrReport",
    searchFields: ["msku", "fnsku", "orderId", "usedMsku", "usedFnsku"],
    dateField: "reportDate",
  },
  grade_resell_items: {
    prismaModel: "gradeResellItem",
    searchFields: ["msku", "fnsku", "asin", "usedMsku"],
    dateField: "gradedDate",
  },
  removal_shipments: {
    prismaModel: "removalShipment",
    searchFields: ["orderId", "fnsku", "trackingNumber"],
    dateField: "shipmentDate",
  },
  removal_receipts: {
    prismaModel: "removalReceipt",
    searchFields: ["orderId", "fnsku", "msku", "trackingNumber"],
    dateField: "receivedDate",
  },
  case_tracker: {
    prismaModel: "caseTracker",
    searchFields: ["msku", "fnsku", "orderId", "shipmentId", "referenceId"],
    dateField: "raisedDate",
  },
  manual_adjustments: {
    prismaModel: "manualAdjustment",
    searchFields: ["msku", "fnsku", "orderId", "shipmentId"],
    dateField: "adjDate",
  },
  uploaded_files: {
    prismaModel: "uploadedFile",
    searchFields: ["filename", "reportType"],
    dateField: "uploadedAt",
  },
  settlement_report: {
    prismaModel: "settlementReport",
    searchFields: ["settlementId", "orderId", "sku", "transactionType"],
  },
  payment_repository: {
    prismaModel: "paymentRepository",
    searchFields: ["settlementId", "orderId", "sku"],
  },
};

function csvEscape(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    try {
      v = JSON.stringify(v);
    } catch {
      v = String(v);
    }
  }
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  return lines.join("\n");
}

type ParamsP = Promise<{ table: string }>;

export async function GET(
  req: NextRequest,
  ctx: { params: ParamsP },
): Promise<Response> {
  const { table: rawTable } = await ctx.params;
  const table = String(rawTable || "").toLowerCase();
  const spec = TABLES[table];
  if (!spec) {
    return new Response(`Unknown table: ${table}`, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const search = (sp.get("search") || "").trim();
  const from = (sp.get("from") || "").trim();
  const to = (sp.get("to") || "").trim();
  const limit = Math.min(50_000, Math.max(1, Number(sp.get("limit") || 10_000) || 10_000));

  const where: Record<string, unknown> = {};
  // Filter soft-deleted rows if the model supports it.
  where.deletedAt = null;

  if (search && spec.searchFields && spec.searchFields.length) {
    where.OR = spec.searchFields.map((f) => ({
      [f]: { contains: search, mode: "insensitive" },
    }));
  }
  if (spec.dateField) {
    const range: Record<string, Date> = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) range.gte = d;
    }
    if (to) {
      const d = new Date(`${to}T23:59:59.999Z`);
      if (!Number.isNaN(d.getTime())) range.lte = d;
    }
    if (Object.keys(range).length) where[spec.dateField] = range;
  }

  let rows: Record<string, unknown>[];
  try {
    const model = prisma[spec.prismaModel] as unknown as {
      findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
    };
    rows = await model.findMany({ where, take: limit });
  } catch (e) {
    // `deletedAt` not on every model — retry without it.
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("Unknown argument") || message.includes("deletedAt")) {
      delete where.deletedAt;
      try {
        const model = prisma[spec.prismaModel] as unknown as {
          findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
        };
        rows = await model.findMany({ where, take: limit });
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2);
        return new Response(`Export failed: ${m2}`, { status: 500 });
      }
    } else {
      return new Response(`Export failed: ${message}`, { status: 500 });
    }
  }

  const flat = rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (v == null) out[k] = "";
      else if (typeof v === "object" && "toString" in v && v.constructor?.name === "Decimal") {
        out[k] = (v as { toString(): string }).toString();
      } else if (v instanceof Date) {
        out[k] = v.toISOString();
      } else {
        out[k] = v;
      }
    }
    return out;
  });

  const csv = toCsv(flat);
  const today = new Date().toISOString().split("T")[0];
  const filename = `${table}_${today}.csv`;
  return new Response(csv || "no rows", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
