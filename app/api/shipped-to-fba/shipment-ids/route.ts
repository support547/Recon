import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Raw = {
  shipment_id: string;
  row_count: bigint;
  total_qty: bigint | null;
  last_ship_date: Date | null;
  rows_with_cost: bigint;
  rows_without_cost: bigint;
};

type CostStatus = "complete" | "partial" | "pending";

export async function GET() {
  try {
    const raw = await prisma.$queryRaw<Raw[]>(Prisma.sql`
      SELECT
        "shipmentId" AS shipment_id,
        COUNT(*)::bigint AS row_count,
        COALESCE(SUM(quantity), 0)::bigint AS total_qty,
        MAX("shipDate") AS last_ship_date,
        COUNT(CASE
          WHEN final_total_purchase_cost_usd IS NOT NULL
            AND final_total_purchase_cost_usd > 0
          THEN 1
        END)::bigint AS rows_with_cost,
        COUNT(CASE
          WHEN final_total_purchase_cost_usd IS NULL
            OR final_total_purchase_cost_usd = 0
          THEN 1
        END)::bigint AS rows_without_cost
      FROM shipped_to_fba
      WHERE "shipmentId" IS NOT NULL
        AND TRIM("shipmentId") <> ''
        AND "deletedAt" IS NULL
      GROUP BY "shipmentId"
      ORDER BY MAX("shipDate") DESC NULLS LAST, "shipmentId" DESC
      LIMIT 250
    `);

    const rows = raw.map((r) => {
      const rowCount = Number(r.row_count);
      const withCost = Number(r.rows_with_cost);
      const withoutCost = Number(r.rows_without_cost);
      let costStatus: CostStatus;
      if (withoutCost === 0 && withCost > 0) costStatus = "complete";
      else if (withCost > 0 && withoutCost > 0) costStatus = "partial";
      else costStatus = "pending";

      return {
        shipment_id: r.shipment_id,
        row_count: rowCount,
        total_qty: Number(r.total_qty ?? 0),
        last_ship_date: r.last_ship_date,
        cost_status: costStatus,
        rows_with_cost: withCost,
        rows_without_cost: withoutCost,
      };
    });

    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[shipment-ids]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
