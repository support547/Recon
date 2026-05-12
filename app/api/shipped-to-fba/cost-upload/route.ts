import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const TEXT_FIELDS = [
  "publisherName",
  "supplierName",
  "deliveryLocation",
  "purchaseId",
] as const;

const MONEY_FIELDS = [
  "finalNetPriceUsd",
  "commissionUsd",
  "supplierShippingUsd",
  "warehousePrepUsd",
  "inventoryPlaceInboundUsd",
  "expertChargesUsd",
  "otherChargesUsd",
] as const;

type TextField = (typeof TEXT_FIELDS)[number];
type MoneyField = (typeof MONEY_FIELDS)[number];

const HEADER_MAP: Record<string, string> = {
  shipmentid: "shipmentId",
  merchantsku: "msku",
  fnsku: "fnsku",
  publishername: "publisherName",
  suppliername: "supplierName",
  delloc: "deliveryLocation",
  deliverylocation: "deliveryLocation",
  purchaseid: "purchaseId",
  finalnetpriceusd: "finalNetPriceUsd",
  commissionusd: "commissionUsd",
  shippingbysupplierusd: "supplierShippingUsd",
  suppliershippingusd: "supplierShippingUsd",
  warehouseprepchargesusd: "warehousePrepUsd",
  warehousepreparationchargesusd: "warehousePrepUsd",
  inventoryplacefeeandindoundusd: "inventoryPlaceInboundUsd",
  inventoryplacefeeandinboundusd: "inventoryPlaceInboundUsd",
  inventoryplaceinboundusd: "inventoryPlaceInboundUsd",
  exportchargesusd: "expertChargesUsd",
  expertchargesusd: "expertChargesUsd",
  otherchargesusd: "otherChargesUsd",
};

function normHeader(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseRows(buf: Buffer, filename: string): string[][] {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
  }
  const text = buf.toString("utf8").replace(/^﻿/, "");
  return parse(text, {
    columns: false,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as string[][];
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let allRows: string[][];
  try {
    allRows = parseRows(buf, file.name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Could not read file: " + msg },
      { status: 400 },
    );
  }

  if (!allRows.length) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  const hdr = allRows[0].map(normHeader);
  const idx: Record<string, number> = {};
  hdr.forEach((h, i) => {
    const f = HEADER_MAP[h];
    if (f && !(f in idx)) idx[f] = i;
  });

  if (!("shipmentId" in idx) || !("msku" in idx)) {
    return NextResponse.json(
      {
        error:
          'Worksheet must include Shipment ID and Merchant SKU columns. Use "Get Sheet" to download the template first.',
      },
      { status: 400 },
    );
  }

  const dataRows = allRows
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? "").trim()));

  const hasFnskuColumn = "fnsku" in idx;
  const errors: string[] = [];

  try {
    const result = await prisma.$transaction(async (tx) => {
      let updated = 0;
      let skipped = 0;
      const now = new Date();

      for (const row of dataRows) {
        const shipmentId = String(row[idx.shipmentId] ?? "").trim();
        const msku = String(row[idx.msku] ?? "").trim();
        if (!shipmentId || !msku) {
          skipped++;
          continue;
        }
        const fnsku = hasFnskuColumn
          ? String(row[idx.fnsku] ?? "").trim()
          : "";

        const data: Prisma.ShippedToFbaUpdateManyMutationInput = {
          costUpdatedAt: now,
        };

        for (const f of TEXT_FIELDS) {
          if (!(f in idx)) continue;
          const v = String(row[idx[f]] ?? "").trim();
          (data as Record<TextField, string | null>)[f] = v || null;
        }

        let perBook = 0;
        let anyMoneyProvided = false;
        for (const f of MONEY_FIELDS) {
          if (!(f in idx)) continue;
          const raw = String(row[idx[f]] ?? "").replace(/,/g, "").trim();
          if (raw === "") {
            (data as Record<MoneyField, number | null>)[f] = null;
            continue;
          }
          const n = Number(raw);
          const val = Number.isFinite(n) ? n : null;
          (data as Record<MoneyField, number | null>)[f] = val;
          if (val != null) {
            perBook += val;
            anyMoneyProvided = true;
          }
        }

        const where: Prisma.ShippedToFbaWhereInput = fnsku
          ? { shipmentId, msku, fnsku }
          : { shipmentId, msku };

        const existing = await tx.shippedToFba.findFirst({
          where,
          select: { quantity: true },
        });
        if (!existing) {
          skipped++;
          if (errors.length < 15) {
            const key = fnsku
              ? `shipmentId=${shipmentId} msku=${msku} fnsku=${fnsku}`
              : `shipmentId=${shipmentId} msku=${msku}`;
            errors.push(`No row for ${key}`);
          }
          continue;
        }

        if (anyMoneyProvided) {
          data.perBookCostUsd = perBook;
          data.finalTotalPurchaseCostUsd = perBook * (existing.quantity || 0);
        }

        await tx.shippedToFba.updateMany({ where, data });
        updated++;
      }

      return { updated, skipped };
    });

    return NextResponse.json({
      success: true,
      rows_updated: result.updated,
      rows_skipped: result.skipped,
      warnings: errors.length ? errors : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cost-upload]", msg);
    return NextResponse.json(
      { error: "Cost upload failed: " + msg },
      { status: 500 },
    );
  }
}
