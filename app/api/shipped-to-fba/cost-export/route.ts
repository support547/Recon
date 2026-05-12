import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const HEADERS = [
  "Shipment ID",
  "Merchant SKU",
  "Title",
  "ASIN",
  "FNSKU",
  "Ship Date",
  "Quantity Shipped",
  "Publisher Name",
  "Supplier Name",
  "Del Loc",
  "Purchase ID",
  "Final Net Price USD",
  "Commission USD",
  "Shipping By Supplier USD",
  "Warehouse Prep Charges USD",
  "Inventory Place Fee And Inbound USD",
  "Export Charges USD",
  "Other Charges USD",
  "Per Book Cost USD",
  "Final Total Purchase Cost USD",
];

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  try {
  const { searchParams } = new URL(req.url);
  const shipmentId = searchParams.get("shipment_id")?.trim() || null;

  const rows = await prisma.shippedToFba.findMany({
    where: shipmentId ? { shipmentId } : {},
    orderBy: [{ shipmentId: "asc" }, { msku: "asc" }],
    select: {
      shipmentId: true,
      msku: true,
      title: true,
      asin: true,
      fnsku: true,
      shipDate: true,
      quantity: true,
      publisherName: true,
      supplierName: true,
      deliveryLocation: true,
      purchaseId: true,
      finalNetPriceUsd: true,
      commissionUsd: true,
      supplierShippingUsd: true,
      warehousePrepUsd: true,
      inventoryPlaceInboundUsd: true,
      expertChargesUsd: true,
      otherChargesUsd: true,
      perBookCostUsd: true,
      finalTotalPurchaseCostUsd: true,
    },
  });

  const lines = [HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    const sd = r.shipDate
      ? new Date(r.shipDate).toISOString().split("T")[0]
      : "";

    lines.push(
      [
        r.shipmentId,
        r.msku,
        r.title,
        r.asin,
        r.fnsku,
        sd,
        r.quantity,
        r.publisherName,
        r.supplierName,
        r.deliveryLocation,
        r.purchaseId,
        r.finalNetPriceUsd,
        r.commissionUsd,
        r.supplierShippingUsd,
        r.warehousePrepUsd,
        r.inventoryPlaceInboundUsd,
        r.expertChargesUsd,
        r.otherChargesUsd,
        r.perBookCostUsd,
        r.finalTotalPurchaseCostUsd,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const filename = shipmentId
    ? `shipped_fba_cost_${shipmentId.replace(/[^\w.-]+/g, "_")}.csv`
    : "shipped_fba_cost_all_shipments.csv";

  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cost-export]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
