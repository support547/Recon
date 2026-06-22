"use server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  PermissionLevel,
  PermissionModule,
  requireLevel,
} from "@/lib/auth/rbac";
import {
  computeInboundRecon,
  type InboundReconPayload,
  type InboundReconSettlementInput,
  type InboundReconShippedInput,
  type InboundReconStatusInput,
} from "@/lib/payment-reconciliation/inbound-recon";

export type {
  InboundReconKpis,
  InboundReconPayload,
  InboundReconRow,
} from "@/lib/payment-reconciliation/inbound-recon";

export interface InboundReconFilters {
  store?: string | null;
}

function dec(d: Prisma.Decimal | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  return Number(d.toString());
}

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export async function getInboundReconData(
  filters: InboundReconFilters = {},
): Promise<InboundReconPayload> {
  await requireLevel(PermissionModule.PAYMENTS, PermissionLevel.VIEW);

  const storeFilter = filters.store ?? null;

  const shippedWhere: Prisma.ShippedToFbaWhereInput = {
    deletedAt: null,
    shipmentId: { not: null },
  };
  if (storeFilter) shippedWhere.store = storeFilter;

  const [shippedRows, statusRows, settlementRows] = await Promise.all([
    prisma.shippedToFba.findMany({
      where: shippedWhere,
      select: { shipmentId: true },
      distinct: ["shipmentId"],
    }),
    prisma.shipmentStatus.findMany({
      where: { deletedAt: null, shipmentId: { not: null } },
      select: {
        shipmentId: true,
        createdDate: true,
        lastUpdated: true,
        totalSkus: true,
        unitsExpected: true,
        unitsLocated: true,
        status: true,
      },
    }),
    prisma.settlementReport.findMany({
      where: {
        deletedAt: null,
        transactionType: { notIn: ["Order", "Refund"] },
        shipmentId: { not: null },
      },
      select: {
        transactionType: true,
        amountDescription: true,
        shipmentId: true,
        amount: true,
      },
    }),
  ]);

  const shippedIn: InboundReconShippedInput[] = shippedRows.map((r) => ({
    shipmentId: r.shipmentId,
  }));
  const statusIn: InboundReconStatusInput[] = statusRows.map((r) => ({
    shipmentId: r.shipmentId,
    createDate: isoDate(r.createdDate),
    closeDate: isoDate(r.lastUpdated),
    totalSkus: r.totalSkus,
    unitsExpected: r.unitsExpected,
    unitsLocated: r.unitsLocated,
    status: r.status,
  }));
  const settlementIn: InboundReconSettlementInput[] = settlementRows.map(
    (r) => ({
      transactionType: r.transactionType,
      amountDescription: r.amountDescription,
      shipmentId: r.shipmentId,
      amount: dec(r.amount),
    }),
  );

  return computeInboundRecon(shippedIn, statusIn, settlementIn);
}
