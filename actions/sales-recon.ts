"use server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  PermissionLevel,
  PermissionModule,
  requireLevel,
} from "@/lib/auth/rbac";
import {
  computeSalesRecon,
  type SalesReconKpis,
  type SalesReconRow,
  type SalesReconSalesInput,
  type SalesReconSettlementInput,
  type SalesReconStatus,
} from "@/lib/payment-reconciliation/sales-recon";

export type SalesReconFilters = {
  from?: string | null;
  to?: string | null;
  store?: string | null;
  statuses?: SalesReconStatus[] | null;
  search?: string | null;
};

export type SalesReconPayload = {
  rows: SalesReconRow[];
  kpis: SalesReconKpis;
  referenceDate: string;
};

function dec(d: Prisma.Decimal | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  return Number(d.toString());
}

function maxDate(dates: (Date | null | undefined)[]): Date | null {
  let max: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!max || d.getTime() > max.getTime()) max = d;
  }
  return max;
}

export async function getSalesReconData(
  filters: SalesReconFilters = {},
): Promise<SalesReconPayload> {
  await requireLevel(PermissionModule.PAYMENTS, PermissionLevel.VIEW);

  const salesWhere: Prisma.SalesDataWhereInput = { deletedAt: null };
  if (filters.from) {
    salesWhere.saleDate = {
      ...(salesWhere.saleDate as object | undefined),
      gte: new Date(filters.from),
    };
  }
  if (filters.to) {
    salesWhere.saleDate = {
      ...(salesWhere.saleDate as object | undefined),
      lte: new Date(filters.to + "T23:59:59"),
    };
  }
  if (filters.store && filters.store.trim() !== "") {
    salesWhere.store = filters.store.trim();
  }

  const [salesRaw, settlementRaw] = await Promise.all([
    prisma.salesData.findMany({
      where: salesWhere,
      select: {
        orderId: true,
        saleDate: true,
        store: true,
        asin: true,
        msku: true,
        fnsku: true,
        fc: true,
        quantity: true,
        productAmount: true,
      },
    }),
    prisma.settlementReport.findMany({
      where: {
        deletedAt: null,
        transactionType: { in: ["Order", "Refund"] },
      },
      select: {
        orderId: true,
        settlementId: true,
        accountType: true,
        store: true,
        transactionType: true,
        amountType: true,
        amountDescription: true,
        amount: true,
        quantityPurchased: true,
        postedDate: true,
        depositDate: true,
        sku: true,
      },
    }),
  ]);

  const settlementByOrderSku = new Map<string, Set<string>>();
  for (const s of settlementRaw) {
    if (!s.orderId) continue;
    const set = settlementByOrderSku.get(s.orderId) ?? new Set<string>();
    if (s.sku) set.add(s.sku);
    settlementByOrderSku.set(s.orderId, set);
  }

  const salesIn: SalesReconSalesInput[] = salesRaw.map((s) => ({
    orderId: s.orderId,
    saleDate: s.saleDate,
    store: s.store,
    asin: s.asin,
    msku: s.msku,
    fnsku: s.fnsku,
    fc: s.fc,
    quantity: s.quantity,
    productAmount: dec(s.productAmount),
  }));
  const settlementIn: SalesReconSettlementInput[] = settlementRaw.map((s) => ({
    orderId: s.orderId,
    settlementId: s.settlementId,
    accountType: s.accountType,
    store: s.store,
    transactionType: s.transactionType,
    amountType: s.amountType,
    amountDescription: s.amountDescription,
    amount: dec(s.amount),
    quantityPurchased: s.quantityPurchased,
    postedDate: s.postedDate,
    depositDate: s.depositDate,
  }));

  const refDeposit = maxDate(settlementRaw.map((s) => s.depositDate));
  const refPosted = maxDate(settlementRaw.map((s) => s.postedDate));
  const referenceDate = refDeposit ?? refPosted ?? new Date();

  const computed = computeSalesRecon(salesIn, settlementIn, { referenceDate });

  let rows = computed.rows;

  const statusFilter =
    filters.statuses && filters.statuses.length > 0
      ? new Set<SalesReconStatus>(filters.statuses)
      : null;
  if (statusFilter) {
    rows = rows.filter((r) => statusFilter.has(r.status));
  }

  if (filters.search && filters.search.trim() !== "") {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter((r) => {
      if (r.orderId.toLowerCase().includes(q)) return true;
      if (r.msku.toLowerCase().includes(q)) return true;
      if (r.store.toLowerCase().includes(q)) return true;
      if (r.settlementStore.toLowerCase().includes(q)) return true;
      if (r.lineItems.some((li) => li.msku.toLowerCase().includes(q))) {
        return true;
      }
      const skus = settlementByOrderSku.get(r.orderId);
      if (skus) {
        for (const sku of skus) {
          if (sku.toLowerCase().includes(q)) return true;
        }
      }
      return false;
    });
  }

  const recomputeKpis = statusFilter || (filters.search && filters.search.trim() !== "");
  const kpis: SalesReconKpis = recomputeKpis
    ? rebuildKpis(rows, computed.kpis.reverseOrphanCount)
    : computed.kpis;

  return {
    rows,
    kpis,
    referenceDate: referenceDate.toISOString().split("T")[0],
  };
}

function rebuildKpis(
  rows: SalesReconRow[],
  reverseOrphanCount: number,
): SalesReconKpis {
  const k: SalesReconKpis = {
    totalOrders: 0,
    totalSaleValue: 0,
    paidCount: 0,
    paidNet: 0,
    partiallyPaidCount: 0,
    partiallyPaidValue: 0,
    waitingCount: 0,
    waitingValue: 0,
    takeActionCount: 0,
    takeActionValue: 0,
    replacementCount: 0,
    replacementQty: 0,
    refundedCount: 0,
    refundedValue: 0,
    totalFees: 0,
    totalNet: 0,
    reverseOrphanCount,
  };
  for (const r of rows) {
    k.totalOrders += 1;
    k.totalSaleValue += r.saleValue;
    k.totalFees += r.setCommission + r.setFbaFees + r.setVarFee;
    k.totalNet += r.netPaid;
    switch (r.status) {
      case "PAID":
        k.paidCount += 1;
        k.paidNet += r.netPaid;
        break;
      case "PARTIALLY_PAID":
        k.partiallyPaidCount += 1;
        k.partiallyPaidValue += r.saleValue;
        break;
      case "WAITING_PAYMENT":
        k.waitingCount += 1;
        k.waitingValue += r.saleValue;
        break;
      case "TAKE_ACTION":
        k.takeActionCount += 1;
        k.takeActionValue += r.saleValue;
        break;
      case "REPLACEMENT":
        k.replacementCount += 1;
        k.replacementQty += r.soldQty;
        break;
      case "REFUNDED":
        k.refundedCount += 1;
        k.refundedValue += r.saleValue;
        break;
    }
  }
  return k;
}
