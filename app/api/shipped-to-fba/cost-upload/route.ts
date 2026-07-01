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

function decToNum(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : 0;
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

  const touchedShipmentIds = Array.from(
    new Set(
      dataRows
        .map((r) => String(r[idx.shipmentId] ?? "").trim())
        .filter((s) => s.length > 0),
    ),
  );

  try {
    const result = await prisma.$transaction(async (tx) => {
      let updated = 0;
      let skipped = 0;
      let cascadeUpdated = 0;
      const now = new Date();

      const inboundRows = touchedShipmentIds.length
        ? await tx.inboundShipment.findMany({
            where: {
              shipmentId: { in: touchedShipmentIds },
              deletedAt: null,
            },
            orderBy: { createdAt: "asc" },
            select: {
              shipmentId: true,
              manualProcFee: true,
              placementFee: true,
              partneredCarrier: true,
            },
          })
        : [];

      const inboundTotalByShipment = new Map<string, number | null>();
      for (const ib of inboundRows) {
        if (inboundTotalByShipment.has(ib.shipmentId)) continue;
        const parts = [ib.manualProcFee, ib.placementFee, ib.partneredCarrier];
        const anyPresent = parts.some((p) => p != null);
        if (!anyPresent) {
          inboundTotalByShipment.set(ib.shipmentId, null);
          continue;
        }
        const total = parts.reduce<number>((s, p) => s + decToNum(p), 0);
        inboundTotalByShipment.set(ib.shipmentId, total);
      }

      const unitsGroups = touchedShipmentIds.length
        ? await tx.shippedToFba.groupBy({
            by: ["shipmentId"],
            where: {
              shipmentId: { in: touchedShipmentIds },
              deletedAt: null,
            },
            _sum: { quantity: true },
          })
        : [];

      const totalUnitsByShipment = new Map<string, number>();
      for (const g of unitsGroups) {
        if (!g.shipmentId) continue;
        totalUnitsByShipment.set(g.shipmentId, g._sum.quantity ?? 0);
      }

      function perBookInbound(shipmentId: string): number | null {
        if (!inboundTotalByShipment.has(shipmentId)) return null;
        const total = inboundTotalByShipment.get(shipmentId);
        if (total == null || total <= 0) return null;
        const units = totalUnitsByShipment.get(shipmentId) ?? 0;
        if (units <= 0) return null;
        return Math.round((total / units) * 10000) / 10000;
      }

      const updatedRowIds = new Set<string>();

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
          if (f === "inventoryPlaceInboundUsd") continue;
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

        // Inventory Place: sheet wins if non-empty; else auto from shipment.
        let inboundResolved: number | null = null;
        const inboundHasColumn = "inventoryPlaceInboundUsd" in idx;
        const inboundRaw = inboundHasColumn
          ? String(row[idx.inventoryPlaceInboundUsd] ?? "")
              .replace(/,/g, "")
              .trim()
          : "";
        if (inboundRaw !== "") {
          const n = Number(inboundRaw);
          inboundResolved = Number.isFinite(n) ? n : null;
        } else {
          inboundResolved = perBookInbound(shipmentId);
        }
        (data as Record<MoneyField, number | null>).inventoryPlaceInboundUsd =
          inboundResolved;
        if (inboundResolved != null) {
          perBook += inboundResolved;
          anyMoneyProvided = true;
        }

        const where: Prisma.ShippedToFbaWhereInput = fnsku
          ? { shipmentId, msku, fnsku }
          : { shipmentId, msku };

        const matches = await tx.shippedToFba.findMany({
          where,
          select: { id: true, quantity: true },
        });
        if (!matches.length) {
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
          data.finalTotalPurchaseCostUsd = perBook * (matches[0].quantity || 0);
        }

        await tx.shippedToFba.updateMany({ where, data });
        for (const m of matches) updatedRowIds.add(m.id);
        updated++;
      }

      // Second pass: refresh inbound on every OTHER row of touched shipments.
      if (touchedShipmentIds.length) {
        const otherRows = await tx.shippedToFba.findMany({
          where: {
            shipmentId: { in: touchedShipmentIds },
            deletedAt: null,
            ...(updatedRowIds.size
              ? { id: { notIn: Array.from(updatedRowIds) } }
              : {}),
          },
          select: {
            id: true,
            shipmentId: true,
            quantity: true,
            finalNetPriceUsd: true,
            commissionUsd: true,
            supplierShippingUsd: true,
            warehousePrepUsd: true,
            inventoryPlaceInboundUsd: true,
            expertChargesUsd: true,
            otherChargesUsd: true,
          },
        });

        for (const r of otherRows) {
          if (!r.shipmentId) continue;
          const newInbound = perBookInbound(r.shipmentId);

          const others = [
            r.finalNetPriceUsd,
            r.commissionUsd,
            r.supplierShippingUsd,
            r.warehousePrepUsd,
            r.expertChargesUsd,
            r.otherChargesUsd,
          ];
          const anyOtherPresent = others.some((v) => v != null);
          const otherSum = others.reduce<number>(
            (s, v) => s + decToNum(v),
            0,
          );

          const patch: Prisma.ShippedToFbaUpdateInput = {
            inventoryPlaceInboundUsd: newInbound,
            costUpdatedAt: now,
          };

          if (newInbound == null && !anyOtherPresent) {
            // Nothing to compute — clear inbound only, leave per-book/final alone.
          } else {
            const perBook = otherSum + (newInbound ?? 0);
            patch.perBookCostUsd = perBook;
            patch.finalTotalPurchaseCostUsd = perBook * (r.quantity || 0);
          }

          await tx.shippedToFba.update({ where: { id: r.id }, data: patch });
          cascadeUpdated++;
        }
      }

      return { updated, skipped, cascadeUpdated };
    });

    return NextResponse.json({
      success: true,
      rows_updated: result.updated,
      rows_skipped: result.skipped,
      rows_cascade_refreshed: result.cascadeUpdated,
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
