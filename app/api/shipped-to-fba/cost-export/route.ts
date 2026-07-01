import { NextResponse } from "next/server";
import * as XLSX from "xlsx-js-style";

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
] as const;

const AMBER_HEADERS = new Set<string>([
  "Inventory Place Fee And Inbound USD",
  "Per Book Cost USD",
  "Final Total Purchase Cost USD",
]);

function cellValue(v: unknown): string | number {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? v : "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "toNumber" in (v as object)) {
    const n = (v as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : "";
  }
  return String(v);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("shipment_ids");
    const singleParam = searchParams.get("shipment_id")?.trim() || null;
    const shipmentIds = idsParam
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : singleParam
        ? [singleParam]
        : [];

    const rows = await prisma.shippedToFba.findMany({
      where: shipmentIds.length ? { shipmentId: { in: shipmentIds } } : {},
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

    const aoa: (string | number)[][] = [HEADERS.slice() as unknown as string[]];
    for (const r of rows) {
      const sd = r.shipDate
        ? new Date(r.shipDate).toISOString().split("T")[0]
        : "";

      aoa.push([
        cellValue(r.shipmentId),
        cellValue(r.msku),
        cellValue(r.title),
        cellValue(r.asin),
        cellValue(r.fnsku),
        sd,
        cellValue(r.quantity),
        cellValue(r.publisherName),
        cellValue(r.supplierName),
        cellValue(r.deliveryLocation),
        cellValue(r.purchaseId),
        cellValue(r.finalNetPriceUsd),
        cellValue(r.commissionUsd),
        cellValue(r.supplierShippingUsd),
        cellValue(r.warehousePrepUsd),
        cellValue(r.inventoryPlaceInboundUsd),
        cellValue(r.expertChargesUsd),
        cellValue(r.otherChargesUsd),
        cellValue(r.perBookCostUsd),
        cellValue(r.finalTotalPurchaseCostUsd),
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    for (let c = 0; c < HEADERS.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      const cell = ws[addr] as { v?: unknown; s?: unknown } | undefined;
      if (!cell) continue;
      const isAmber = AMBER_HEADERS.has(HEADERS[c]);
      cell.s = {
        font: { bold: true, color: { rgb: "000000" } },
        alignment: { vertical: "center", horizontal: "left" },
        ...(isAmber
          ? {
              fill: {
                patternType: "solid",
                fgColor: { rgb: "FFF2CC" },
                bgColor: { rgb: "FFF2CC" },
              },
            }
          : {}),
      };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cost Worksheet");

    const buf = XLSX.write(wb, {
      type: "buffer",
      bookType: "xlsx",
      cellStyles: true,
    }) as Buffer;

    const ab = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;

    const filename =
      shipmentIds.length === 1
        ? `shipped_fba_cost_${shipmentIds[0].replace(/[^\w.-]+/g, "_")}.xlsx`
        : shipmentIds.length > 1
          ? `shipped_fba_cost_${shipmentIds.length}_shipments.xlsx`
          : "shipped_fba_cost_all_shipments.xlsx";

    return new Response(ab, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
