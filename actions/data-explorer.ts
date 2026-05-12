"use server";

import { endOfDay, startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";

import {
  type DataExplorerTabId,
  isDataExplorerTabId,
} from "@/lib/data-explorer-constants";
import { prisma } from "@/lib/prisma";

export type DataExplorerFilters = {
  dateFrom?: string;
  dateTo?: string;
  store?: string;
  search?: string;
  shipmentId?: string;
  msku?: string;
  fnsku?: string;
  disposition?: string;
  fc?: string;
  reason?: string;
  orderStatus?: string;
  fulfillmentCenter?: string;
  shipmentStatus?: string;
  settlementId?: string;
  transactionStatus?: string;
  unitStatus?: string;
  flag?: string;
  adjStore?: string;
  salesView?: "fnsku" | "asin";
  fbaSummaryView?: "details" | "summary";
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

export type ExplorerSummaryCard = {
  id: string;
  label: string;
  value: string;
  sub?: string;
  tone: "blue" | "green" | "yellow" | "teal" | "purple" | "orange" | "red" | "gray";
};

export type ExplorerMiniTable = {
  title: string;
  headers: string[];
  rows: string[][];
};

export type DataExplorerSummary = {
  cards: ExplorerSummaryCard[];
  miniTables?: ExplorerMiniTable[];
  progressPct?: number;
  progressLabel?: string;
};

function shipEq(id?: string): string | undefined {
  const s = id?.trim();
  if (!s) return undefined;
  return s;
}

function parsePostedRange(filters?: DataExplorerFilters): {
  gte?: string;
  lte?: string;
} {
  const { from, to } = parseDateRange(filters);
  const gte = from ? from.toISOString() : undefined;
  const lte = to ? to.toISOString() : undefined;
  return { gte, lte };
}

function normalizePagination(
  page?: number,
  pageSize?: number,
): { page: number; pageSize: number; skip: number } {
  const p = Number.isFinite(page) && page! > 0 ? Math.floor(page!) : 1;
  const rawPs =
    Number.isFinite(pageSize) && pageSize! > 0
      ? Math.floor(pageSize!)
      : DEFAULT_PAGE_SIZE;
  const ps = Math.min(MAX_PAGE_SIZE, Math.max(1, rawPs));
  return { page: p, pageSize: ps, skip: (p - 1) * ps };
}

function parseDateRange(filters?: DataExplorerFilters): {
  from?: Date;
  to?: Date;
} {
  let from: Date | undefined;
  let to: Date | undefined;
  if (filters?.dateFrom?.trim()) {
    const d = new Date(filters.dateFrom.trim());
    if (!Number.isNaN(d.getTime())) from = startOfDay(d);
  }
  if (filters?.dateTo?.trim()) {
    const d = new Date(filters.dateTo.trim());
    if (!Number.isNaN(d.getTime())) to = endOfDay(d);
  }
  return { from, to };
}

function storeEq(store?: string): string | undefined {
  if (!store || store === "__all__" || !store.trim()) return undefined;
  return store.trim();
}

function dec(v: { toString(): string } | null | undefined): string | null {
  return v == null ? null : v.toString();
}

/** Distinct non-null stores across all explorer tables */
export async function getDataExplorerStoreOptions(): Promise<string[]> {
  const chunks = await Promise.all([
    prisma.shippedToFba.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.salesData.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.fbaReceipt.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.customerReturn.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.reimbursement.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.fbaRemoval.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.fcTransfer.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.shipmentStatus.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.fbaSummary.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.replacement.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.adjustment.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.gnrReport.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
    prisma.paymentRepository.findMany({
      where: { deletedAt: null, store: { not: null } },
      distinct: ["store"],
      select: { store: true },
    }),
  ]);
  const set = new Set<string>();
  for (const rows of chunks) {
    for (const r of rows) {
      const s = r.store?.trim();
      if (s) set.add(s);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function getDataExplorerTabStats(): Promise<{
  counts: Record<DataExplorerTabId, number>;
  lastUploadedAt: Partial<Record<DataExplorerTabId, Date | null>>;
}> {
  const [
    shipped_to_fba,
    shipped_cost,
    sales_data,
    fba_receipts,
    customer_returns,
    reimbursements,
    fba_removals,
    fc_transfers,
    shipment_status,
    fba_summary,
    replacements,
    adjustments,
    gnr_report,
    payment_repository,
  ] = await Promise.all([
    prisma.shippedToFba.count({ where: { deletedAt: null } }),
    prisma.shippedToFba.count({
      where: {
        deletedAt: null,
        perBookCostUsd: { not: null, gt: 0 },
      },
    }),
    prisma.salesData.count({ where: { deletedAt: null } }),
    prisma.fbaReceipt.count({ where: { deletedAt: null } }),
    prisma.customerReturn.count({ where: { deletedAt: null } }),
    prisma.reimbursement.count({ where: { deletedAt: null } }),
    prisma.fbaRemoval.count({ where: { deletedAt: null } }),
    prisma.fcTransfer.count({ where: { deletedAt: null } }),
    prisma.shipmentStatus.count({ where: { deletedAt: null } }),
    prisma.fbaSummary.count({ where: { deletedAt: null } }),
    prisma.replacement.count({ where: { deletedAt: null } }),
    prisma.adjustment.count({ where: { deletedAt: null } }),
    prisma.gnrReport.count({ where: { deletedAt: null } }),
    prisma.paymentRepository.count({ where: { deletedAt: null } }),
  ]);

  const uploads = await prisma.uploadedFile.groupBy({
    by: ["reportType"],
    _max: { uploadedAt: true },
  });
  const lastUploadedAt: Partial<Record<DataExplorerTabId, Date | null>> = {};
  for (const u of uploads) {
    if (isDataExplorerTabId(u.reportType)) {
      lastUploadedAt[u.reportType] = u._max.uploadedAt ?? null;
    }
  }

  return {
    counts: {
      shipped_to_fba,
      shipped_cost,
      sales_data,
      fba_receipts,
      customer_returns,
      reimbursements,
      fba_removals,
      fc_transfers,
      shipment_status,
      fba_summary,
      replacements,
      adjustments,
      gnr_report,
      payment_repository,
    },
    lastUploadedAt,
  };
}

export async function getShippedToFba(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string;
    title: string | null;
    asin: string | null;
    fnsku: string | null;
    shipDate: Date | null;
    quantity: number;
    shipmentId: string | null;
    store: string | null;
    publisherName: string | null;
    supplierName: string | null;
    deliveryLocation: string | null;
    purchaseId: string | null;
    perBookCostUsd: string | null;
    finalTotalPurchaseCostUsd: string | null;
    costUpdatedAt: Date | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const sid = shipEq(filters?.shipmentId);
  const mskuQ = filters?.msku?.trim();
  const fnskuQ = filters?.fnsku?.trim();

  const where: Prisma.ShippedToFbaWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(sid !== undefined ? { shipmentId: sid } : {}),
    ...(mskuQ ? { msku: { contains: mskuQ, mode: "insensitive" } } : {}),
    ...(fnskuQ ? { fnsku: { contains: fnskuQ, mode: "insensitive" } } : {}),
    ...(q
      ? {
          OR: [
            { msku: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { asin: { contains: q, mode: "insensitive" } },
            { fnsku: { contains: q, mode: "insensitive" } },
            { shipmentId: { contains: q, mode: "insensitive" } },
            { publisherName: { contains: q, mode: "insensitive" } },
            { supplierName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.shippedToFba.count({ where }),
    prisma.shippedToFba.findMany({
      where,
      orderBy: [{ shipDate: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        title: true,
        asin: true,
        fnsku: true,
        shipDate: true,
        quantity: true,
        shipmentId: true,
        store: true,
        publisherName: true,
        supplierName: true,
        deliveryLocation: true,
        purchaseId: true,
        perBookCostUsd: true,
        finalTotalPurchaseCostUsd: true,
        costUpdatedAt: true,
      },
    }),
  ]);
  return {
    data: rows.map((r) => ({
      ...r,
      perBookCostUsd: dec(r.perBookCostUsd),
      finalTotalPurchaseCostUsd: dec(r.finalTotalPurchaseCostUsd),
    })),
    total,
    page: p,
    pageSize: ps,
  };
}

export async function getShippedCostData(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string;
    title: string | null;
    asin: string | null;
    fnsku: string | null;
    shipDate: Date | null;
    quantity: number;
    shipmentId: string | null;
    store: string | null;
    publisherName: string | null;
    supplierName: string | null;
    deliveryLocation: string | null;
    purchaseId: string | null;
    finalNetPriceUsd: string | null;
    commissionUsd: string | null;
    supplierShippingUsd: string | null;
    warehousePrepUsd: string | null;
    inventoryPlaceInboundUsd: string | null;
    expertChargesUsd: string | null;
    otherChargesUsd: string | null;
    perBookCostUsd: string | null;
    finalTotalPurchaseCostUsd: string | null;
    costUpdatedAt: Date | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const sid = shipEq(filters?.shipmentId);
  const { from, to } = parseDateRange(filters);

  const where: Prisma.ShippedToFbaWhereInput = {
    deletedAt: null,
    perBookCostUsd: { not: null, gt: 0 },
    ...(sw !== undefined ? { store: sw } : {}),
    ...(sid !== undefined ? { shipmentId: sid } : {}),
    ...(from || to
      ? {
          shipDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { msku: { contains: q, mode: "insensitive" } },
            { asin: { contains: q, mode: "insensitive" } },
            { fnsku: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { publisherName: { contains: q, mode: "insensitive" } },
            { supplierName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.shippedToFba.count({ where }),
    prisma.shippedToFba.findMany({
      where,
      orderBy: [{ costUpdatedAt: "desc" }, { shipDate: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        title: true,
        asin: true,
        fnsku: true,
        shipDate: true,
        quantity: true,
        shipmentId: true,
        store: true,
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
        costUpdatedAt: true,
      },
    }),
  ]);

  return {
    data: rows.map((r) => ({
      ...r,
      finalNetPriceUsd: dec(r.finalNetPriceUsd),
      commissionUsd: dec(r.commissionUsd),
      supplierShippingUsd: dec(r.supplierShippingUsd),
      warehousePrepUsd: dec(r.warehousePrepUsd),
      inventoryPlaceInboundUsd: dec(r.inventoryPlaceInboundUsd),
      expertChargesUsd: dec(r.expertChargesUsd),
      otherChargesUsd: dec(r.otherChargesUsd),
      perBookCostUsd: dec(r.perBookCostUsd),
      finalTotalPurchaseCostUsd: dec(r.finalTotalPurchaseCostUsd),
    })),
    total,
    page: p,
    pageSize: ps,
  };
}

export async function getSalesData(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string | null;
    fnsku: string | null;
    asin: string | null;
    orderId: string | null;
    quantity: number;
    saleDate: Date | null;
    productAmount: string | null;
    shippingAmount: string | null;
    currency: string | null;
    fc: string | null;
    shipCity: string | null;
    shipState: string | null;
    shipPostalCode: string | null;
    store: string | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const fc = filters?.fc?.trim();

  const where: Prisma.SalesDataWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(from || to
      ? {
          saleDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(fc ? { fc } : {}),
    ...(q
      ? {
          OR: [
            { msku: { contains: q, mode: "insensitive" } },
            { fnsku: { contains: q, mode: "insensitive" } },
            { orderId: { contains: q, mode: "insensitive" } },
            { asin: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.salesData.count({ where }),
    prisma.salesData.findMany({
      where,
      orderBy: [{ saleDate: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        fnsku: true,
        asin: true,
        orderId: true,
        quantity: true,
        saleDate: true,
        productAmount: true,
        shippingAmount: true,
        currency: true,
        fc: true,
        shipCity: true,
        shipState: true,
        shipPostalCode: true,
        store: true,
      },
    }),
  ]);
  return {
    data: rows.map((r) => ({
      ...r,
      productAmount: dec(r.productAmount),
      shippingAmount: dec(r.shippingAmount),
    })),
    total,
    page: p,
    pageSize: ps,
  };
}

export type SalesAsinRow = {
  asin: string;
  orders: number;
  unitsSold: number;
  firstSale: Date | null;
  lastSale: Date | null;
  topFc: string | null;
};

export async function getSalesDataByAsin(
  filters: DataExplorerFilters | undefined,
  page?: number,
  pageSize?: number,
): Promise<PaginatedResult<SalesAsinRow>> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const fc = filters?.fc?.trim();

  const storeCond =
    sw !== undefined ? Prisma.sql`AND s.store = ${sw}` : Prisma.empty;
  const fromCond = from
    ? Prisma.sql`AND s."saleDate" >= ${from}`
    : Prisma.empty;
  const toCond = to ? Prisma.sql`AND s."saleDate" <= ${to}` : Prisma.empty;
  const fcCond = fc ? Prisma.sql`AND s.fc = ${fc}` : Prisma.empty;
  const searchCond = q
    ? Prisma.sql`AND (
        s.msku ILIKE ${"%" + q + "%"}
        OR s.fnsku ILIKE ${"%" + q + "%"}
        OR s."orderId" ILIKE ${"%" + q + "%"}
        OR s.asin ILIKE ${"%" + q + "%"}
      )`
    : Prisma.empty;

  const countRows = await prisma.$queryRaw<[{ n: bigint }]>`
    WITH base AS (
      SELECT s.*
      FROM sales_data s
      WHERE s."deletedAt" IS NULL
      ${storeCond}
      ${fromCond}
      ${toCond}
      ${fcCond}
      ${searchCond}
    )
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT COALESCE(NULLIF(TRIM(b.asin), ''), '—') AS akey
      FROM base b
      GROUP BY 1
    ) t;
  `;
  const total = Number(countRows[0]?.n ?? 0);

  const data = await prisma.$queryRaw<SalesAsinRow[]>`
    WITH base AS (
      SELECT s.*
      FROM sales_data s
      WHERE s."deletedAt" IS NULL
      ${storeCond}
      ${fromCond}
      ${toCond}
      ${fcCond}
      ${searchCond}
    ),
    agg AS (
      SELECT
        COALESCE(NULLIF(TRIM(b.asin), ''), '—') AS asin,
        COUNT(DISTINCT b."orderId") FILTER (WHERE b."orderId" IS NOT NULL)::int AS orders,
        COALESCE(SUM(b.quantity), 0)::int AS "unitsSold",
        MIN(b."saleDate") AS "firstSale",
        MAX(b."saleDate") AS "lastSale"
      FROM base b
      GROUP BY 1
    ),
    fc_tot AS (
      SELECT
        COALESCE(NULLIF(TRIM(b.asin), ''), '—') AS asin,
        TRIM(COALESCE(b.fc, 'Unknown')) AS fc,
        SUM(b.quantity)::bigint AS q
      FROM base b
      GROUP BY 1, 2
    ),
    fc_rank AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY asin ORDER BY q DESC) AS rn
      FROM fc_tot
    )
    SELECT
      agg.asin AS asin,
      agg.orders AS orders,
      agg."unitsSold" AS "unitsSold",
      agg."firstSale" AS "firstSale",
      agg."lastSale" AS "lastSale",
      fc_rank.fc AS "topFc"
    FROM agg
    LEFT JOIN fc_rank ON fc_rank.asin = agg.asin AND fc_rank.rn = 1
    ORDER BY agg."unitsSold" DESC
    LIMIT ${ps} OFFSET ${skip};
  `;

  return {
    data,
    total,
    page: p,
    pageSize: ps,
  };
}

export async function getFbaReceipts(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string | null;
    title: string | null;
    asin: string | null;
    fnsku: string | null;
    shipmentId: string | null;
    quantity: number;
    receiptDate: Date | null;
    disposition: string | null;
    eventType: string | null;
    fulfillmentCenter: string | null;
    reason: string | null;
    country: string | null;
    reconciledQty: number;
    unreconciledQty: number;
    store: string | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const sid = shipEq(filters?.shipmentId);
  const disp = filters?.disposition?.trim();
  const mskuQ = filters?.msku?.trim();

  const where: Prisma.FbaReceiptWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(from || to
      ? {
          receiptDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(sid !== undefined ? { shipmentId: sid } : {}),
    ...(disp
      ? { disposition: { equals: disp, mode: "insensitive" } }
      : {}),
    ...(mskuQ ? { msku: { contains: mskuQ, mode: "insensitive" } } : {}),
    ...(q
      ? {
          OR: [
            { msku: { contains: q, mode: "insensitive" } },
            { fnsku: { contains: q, mode: "insensitive" } },
            { shipmentId: { contains: q, mode: "insensitive" } },
            { disposition: { contains: q, mode: "insensitive" } },
            { fulfillmentCenter: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { asin: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.fbaReceipt.count({ where }),
    prisma.fbaReceipt.findMany({
      where,
      orderBy: [{ receiptDate: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        title: true,
        asin: true,
        fnsku: true,
        shipmentId: true,
        quantity: true,
        receiptDate: true,
        disposition: true,
        eventType: true,
        fulfillmentCenter: true,
        reason: true,
        country: true,
        reconciledQty: true,
        unreconciledQty: true,
        store: true,
      },
    }),
  ]);
  return { data: rows, total, page: p, pageSize: ps };
}

export async function getCustomerReturns(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string | null;
    fnsku: string | null;
    asin: string | null;
    title: string | null;
    orderId: string | null;
    quantity: number;
    returnDate: Date | null;
    disposition: string | null;
    detailedDisposition: string | null;
    reason: string | null;
    status: string | null;
    fulfillmentCenter: string | null;
    licensePlateNumber: string | null;
    store: string | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const disp = filters?.disposition?.trim();

  const where: Prisma.CustomerReturnWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(from || to
      ? {
          returnDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(disp
      ? {
          disposition: { equals: disp, mode: "insensitive" },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { msku: { contains: q, mode: "insensitive" } },
            { fnsku: { contains: q, mode: "insensitive" } },
            { orderId: { contains: q, mode: "insensitive" } },
            { disposition: { contains: q, mode: "insensitive" } },
            { reason: { contains: q, mode: "insensitive" } },
            { asin: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.customerReturn.count({ where }),
    prisma.customerReturn.findMany({
      where,
      orderBy: [{ returnDate: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        fnsku: true,
        asin: true,
        title: true,
        orderId: true,
        quantity: true,
        returnDate: true,
        disposition: true,
        detailedDisposition: true,
        reason: true,
        status: true,
        fulfillmentCenter: true,
        licensePlateNumber: true,
        store: true,
      },
    }),
  ]);
  return { data: rows, total, page: p, pageSize: ps };
}

export async function getReimbursements(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string | null;
    fnsku: string | null;
    asin: string | null;
    reason: string | null;
    quantity: number;
    qtyCash: number;
    qtyInventory: number;
    amount: string | null;
    amountPerUnit: string | null;
    approvalDate: Date | null;
    currency: string | null;
    reimbursementId: string | null;
    amazonOrderId: string | null;
    store: string | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const reasonEq = filters?.reason?.trim();

  const where: Prisma.ReimbursementWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(from || to
      ? {
          approvalDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(reasonEq
      ? { reason: { equals: reasonEq, mode: "insensitive" } }
      : {}),
    ...(q
      ? {
          OR: [
            { msku: { contains: q, mode: "insensitive" } },
            { fnsku: { contains: q, mode: "insensitive" } },
            { reason: { contains: q, mode: "insensitive" } },
            { caseId: { contains: q, mode: "insensitive" } },
            { amazonOrderId: { contains: q, mode: "insensitive" } },
            { reimbursementId: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.reimbursement.count({ where }),
    prisma.reimbursement.findMany({
      where,
      orderBy: [{ approvalDate: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        fnsku: true,
        asin: true,
        reason: true,
        quantity: true,
        qtyCash: true,
        qtyInventory: true,
        amount: true,
        amountPerUnit: true,
        approvalDate: true,
        currency: true,
        reimbursementId: true,
        amazonOrderId: true,
        store: true,
      },
    }),
  ]);
  return {
    data: rows.map((r) => ({
      ...r,
      amount: dec(r.amount),
      amountPerUnit: dec(r.amountPerUnit),
    })),
    total,
    page: p,
    pageSize: ps,
  };
}

export async function getFbaRemovals(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string | null;
    fnsku: string | null;
    orderId: string | null;
    quantity: number;
    disposition: string | null;
    orderStatus: string | null;
    orderType: string | null;
    requestDate: Date | null;
    cancelledQty: number;
    disposedQty: number;
    removalFee: string | null;
    currency: string | null;
    store: string | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const os = filters?.orderStatus?.trim();
  const disp = filters?.disposition?.trim();
  const mskuQ = filters?.msku?.trim();

  const where: Prisma.FbaRemovalWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(from || to
      ? {
          requestDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(os
      ? { orderStatus: { equals: os, mode: "insensitive" } }
      : {}),
    ...(disp
      ? { disposition: { equals: disp, mode: "insensitive" } }
      : {}),
    ...(mskuQ ? { msku: { contains: mskuQ, mode: "insensitive" } } : {}),
    ...(q
      ? {
          OR: [
            { orderId: { contains: q, mode: "insensitive" } },
            { fnsku: { contains: q, mode: "insensitive" } },
            { disposition: { contains: q, mode: "insensitive" } },
            { orderStatus: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.fbaRemoval.count({ where }),
    prisma.fbaRemoval.findMany({
      where,
      orderBy: [{ requestDate: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        fnsku: true,
        orderId: true,
        quantity: true,
        disposition: true,
        orderStatus: true,
        orderType: true,
        requestDate: true,
        cancelledQty: true,
        disposedQty: true,
        removalFee: true,
        currency: true,
        store: true,
      },
    }),
  ]);
  return {
    data: rows.map((r) => ({ ...r, removalFee: dec(r.removalFee) })),
    total,
    page: p,
    pageSize: ps,
  };
}

export async function getFcTransfers(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string | null;
    fnsku: string | null;
    asin: string | null;
    title: string | null;
    referenceId: string | null;
    quantity: number;
    transferDate: Date | null;
    eventType: string | null;
    fulfillmentCenter: string | null;
    disposition: string | null;
    reason: string | null;
    country: string | null;
    reconciledQty: number;
    unreconciledQty: number;
    store: string | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const fc = filters?.fulfillmentCenter?.trim();

  const where: Prisma.FcTransferWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(from || to
      ? {
          transferDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(fc ? { fulfillmentCenter: fc } : {}),
    ...(q
      ? {
          OR: [
            { msku: { contains: q, mode: "insensitive" } },
            { fnsku: { contains: q, mode: "insensitive" } },
            { referenceId: { contains: q, mode: "insensitive" } },
            { asin: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { eventType: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.fcTransfer.count({ where }),
    prisma.fcTransfer.findMany({
      where,
      orderBy: [{ transferDate: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        fnsku: true,
        asin: true,
        title: true,
        referenceId: true,
        quantity: true,
        transferDate: true,
        eventType: true,
        fulfillmentCenter: true,
        disposition: true,
        reason: true,
        country: true,
        reconciledQty: true,
        unreconciledQty: true,
        store: true,
      },
    }),
  ]);
  return { data: rows, total, page: p, pageSize: ps };
}

export async function getShipmentStatus(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    shipmentId: string | null;
    shipmentName: string | null;
    createdDate: Date | null;
    shipTo: string | null;
    status: string | null;
    unitsExpected: number;
    unitsLocated: number;
    lastUpdated: Date | null;
    store: string | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const st = filters?.shipmentStatus?.trim();

  const where: Prisma.ShipmentStatusWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(from || to
      ? {
          lastUpdated: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(st
      ? { status: { equals: st, mode: "insensitive" } }
      : {}),
    ...(q
      ? {
          OR: [
            { shipmentId: { contains: q, mode: "insensitive" } },
            { shipmentName: { contains: q, mode: "insensitive" } },
            { status: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.shipmentStatus.count({ where }),
    prisma.shipmentStatus.findMany({
      where,
      orderBy: [{ lastUpdated: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        shipmentId: true,
        shipmentName: true,
        createdDate: true,
        shipTo: true,
        status: true,
        unitsExpected: true,
        unitsLocated: true,
        lastUpdated: true,
        store: true,
      },
    }),
  ]);
  return { data: rows, total, page: p, pageSize: ps };
}

export async function getFbaSummaryDetails(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string | null;
    fnsku: string | null;
    asin: string | null;
    title: string | null;
    disposition: string | null;
    summaryDate: Date | null;
    startingBalance: number;
    inTransit: number;
    receipts: number;
    customerShipments: number;
    customerReturns: number;
    vendorReturns: number;
    warehouseTransfer: number;
    found: number;
    lost: number;
    damaged: number;
    disposedQty: number;
    otherEvents: number;
    unknownEvents: number;
    endingBalance: number;
    location: string | null;
    store: string | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const disp = filters?.disposition?.trim();
  const mskuQ = filters?.msku?.trim();
  const fnskuQ = filters?.fnsku?.trim();

  const where: Prisma.FbaSummaryWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(from || to
      ? {
          summaryDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(disp
      ? { disposition: { equals: disp, mode: "insensitive" } }
      : {}),
    ...(mskuQ ? { msku: { contains: mskuQ, mode: "insensitive" } } : {}),
    ...(fnskuQ ? { fnsku: { contains: fnskuQ, mode: "insensitive" } } : {}),
    ...(q
      ? {
          OR: [
            { msku: { contains: q, mode: "insensitive" } },
            { fnsku: { contains: q, mode: "insensitive" } },
            { asin: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { disposition: { contains: q, mode: "insensitive" } },
            { location: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.fbaSummary.count({ where }),
    prisma.fbaSummary.findMany({
      where,
      orderBy: [{ summaryDate: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        fnsku: true,
        asin: true,
        title: true,
        disposition: true,
        summaryDate: true,
        startingBalance: true,
        inTransit: true,
        receipts: true,
        customerShipments: true,
        customerReturns: true,
        vendorReturns: true,
        warehouseTransfer: true,
        found: true,
        lost: true,
        damaged: true,
        disposedQty: true,
        otherEvents: true,
        unknownEvents: true,
        endingBalance: true,
        location: true,
        store: true,
      },
    }),
  ]);
  return { data: rows, total, page: p, pageSize: ps };
}

export type FbaSummaryGroupedRow = {
  fnsku: string | null;
  msku: string | null;
  asin: string | null;
  title: string | null;
  openingBalance: number;
  custShipped: number;
  custReturns: number;
  vendorReturns: number;
  transfers: number;
  found: number;
  lost: number;
  damaged: number;
  disposed: number;
  otherEvents: number;
  unknownEvents: number;
  adjustment: number;
  endingBalance: number;
};

export async function getFbaSummaryGrouped(
  filters: DataExplorerFilters | undefined,
  page?: number,
  pageSize?: number,
): Promise<PaginatedResult<FbaSummaryGroupedRow>> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const disp = filters?.disposition?.trim();
  const mskuQ = filters?.msku?.trim();
  const fnskuQ = filters?.fnsku?.trim();

  const storeCond =
    sw !== undefined ? Prisma.sql`AND b.store = ${sw}` : Prisma.empty;
  const fromCond = from
    ? Prisma.sql`AND b."summaryDate" >= ${from}`
    : Prisma.empty;
  const toCond = to
    ? Prisma.sql`AND b."summaryDate" <= ${to}`
    : Prisma.empty;
  const dispCond = disp
    ? Prisma.sql`AND b.disposition = ${disp}`
    : Prisma.empty;
  const mskuCond = mskuQ
    ? Prisma.sql`AND b.msku ILIKE ${"%" + mskuQ + "%"}`
    : Prisma.empty;
  const fnskuCond = fnskuQ
    ? Prisma.sql`AND b.fnsku ILIKE ${"%" + fnskuQ + "%"}`
    : Prisma.empty;
  const searchCond = q
    ? Prisma.sql`AND (
        b.msku ILIKE ${"%" + q + "%"}
        OR b.fnsku ILIKE ${"%" + q + "%"}
        OR b.asin ILIKE ${"%" + q + "%"}
        OR b.title ILIKE ${"%" + q + "%"}
        OR b.disposition ILIKE ${"%" + q + "%"}
        OR b.location ILIKE ${"%" + q + "%"}
      )`
    : Prisma.empty;

  const countRows = await prisma.$queryRaw<[{ n: bigint }]>`
    WITH base AS (
      SELECT b.*
      FROM fba_summary b
      WHERE b."deletedAt" IS NULL
      ${storeCond}
      ${fromCond}
      ${toCond}
      ${dispCond}
      ${mskuCond}
      ${fnskuCond}
      ${searchCond}
    )
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT COALESCE(NULLIF(TRIM(b.fnsku), ''), NULLIF(TRIM(b.msku), ''), '—') AS gk
      FROM base b
      GROUP BY 1
    ) t;
  `;
  const total = Number(countRows[0]?.n ?? 0);

  const data = await prisma.$queryRaw<FbaSummaryGroupedRow[]>`
    WITH base AS (
      SELECT b.*
      FROM fba_summary b
      WHERE b."deletedAt" IS NULL
      ${storeCond}
      ${fromCond}
      ${toCond}
      ${dispCond}
      ${mskuCond}
      ${fnskuCond}
      ${searchCond}
    ),
    gk AS (
      SELECT COALESCE(NULLIF(TRIM(b.fnsku), ''), NULLIF(TRIM(b.msku), ''), '—') AS g,
             MAX(b.msku) AS "msku",
             MAX(b.fnsku) AS "fnsku",
             MAX(b.asin) AS "asin",
             MAX(b.title) AS "title",
             SUM(b.receipts)::int AS "openingBalance",
             SUM(b."customerShipments")::int AS "custShipped",
             SUM(b."customerReturns")::int AS "custReturns",
             SUM(b."vendorReturns")::int AS "vendorReturns",
             SUM(b."warehouseTransfer")::int AS "transfers",
             SUM(b.found)::int AS found,
             SUM(b.lost)::int AS lost,
             SUM(b.damaged)::int AS damaged,
             SUM(b."disposedQty")::int AS disposed,
             SUM(b."otherEvents")::int AS "otherEvents",
             SUM(b."unknownEvents")::int AS "unknownEvents"
      FROM base b
      GROUP BY 1
    ),
    latest AS (
      SELECT DISTINCT ON (COALESCE(NULLIF(TRIM(b.fnsku), ''), NULLIF(TRIM(b.msku), ''), '—'))
        COALESCE(NULLIF(TRIM(b.fnsku), ''), NULLIF(TRIM(b.msku), ''), '—') AS g,
        b."endingBalance"::int AS "endingBalance"
      FROM base b
      ORDER BY 1, b."summaryDate" DESC NULLS LAST, b.id DESC
    )
    SELECT
      gk."fnsku" AS "fnsku",
      gk."msku" AS "msku",
      gk."asin" AS "asin",
      gk."title" AS "title",
      gk."openingBalance" AS "openingBalance",
      gk."custShipped" AS "custShipped",
      gk."custReturns" AS "custReturns",
      gk."vendorReturns" AS "vendorReturns",
      gk."transfers" AS "transfers",
      gk.found AS found,
      gk.lost AS lost,
      gk.damaged AS damaged,
      gk.disposed AS disposed,
      gk."otherEvents" AS "otherEvents",
      gk."unknownEvents" AS "unknownEvents",
      (gk.found + gk.lost + gk.damaged + gk.disposed + gk."otherEvents" + gk."unknownEvents")::int AS adjustment,
      latest."endingBalance" AS "endingBalance"
    FROM gk
    JOIN latest ON latest.g = gk.g
    ORDER BY latest."endingBalance" DESC
    LIMIT ${ps} OFFSET ${skip};
  `;

  return { data, total, page: p, pageSize: ps };
}

export async function getReplacements(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string | null;
    asin: string | null;
    orderId: string | null;
    originalOrderId: string | null;
    quantity: number;
    shipmentDate: Date | null;
    replacementReasonCode: string | null;
    fulfillmentCenter: string | null;
    store: string | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();

  const where: Prisma.ReplacementWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(from || to
      ? {
          shipmentDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { msku: { contains: q, mode: "insensitive" } },
            { asin: { contains: q, mode: "insensitive" } },
            { orderId: { contains: q, mode: "insensitive" } },
            { replacementOrderId: { contains: q, mode: "insensitive" } },
            { originalOrderId: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.replacement.count({ where }),
    prisma.replacement.findMany({
      where,
      orderBy: [{ shipmentDate: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        asin: true,
        orderId: true,
        originalOrderId: true,
        quantity: true,
        shipmentDate: true,
        replacementReasonCode: true,
        fulfillmentCenterId: true,
        store: true,
      },
    }),
  ]);
  return {
    data: rows.map((r) => ({
      msku: r.msku,
      asin: r.asin,
      orderId: r.orderId,
      originalOrderId: r.originalOrderId,
      quantity: r.quantity,
      shipmentDate: r.shipmentDate,
      replacementReasonCode: r.replacementReasonCode,
      fulfillmentCenter: r.fulfillmentCenterId,
      store: r.store,
    })),
    total,
    page: p,
    pageSize: ps,
  };
}

/** Raw uploaded adjustments (CSV upload), not manual recon adjustments */
export async function getAdjustments(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string;
    flag: string | null;
    quantity: number;
    store: string | null;
    uploadedAt: Date;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const mskuQ = filters?.msku?.trim();
  const flagQ = filters?.flag?.trim();
  const st = filters?.adjStore?.trim();

  const where: Prisma.AdjustmentWhereInput = {
    deletedAt: null,
    ...(mskuQ ? { msku: { contains: mskuQ, mode: "insensitive" } } : {}),
    ...(flagQ ? { flag: { contains: flagQ, mode: "insensitive" } } : {}),
    ...(st ? { store: { contains: st, mode: "insensitive" } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.adjustment.count({ where }),
    prisma.adjustment.findMany({
      where,
      orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        flag: true,
        quantity: true,
        store: true,
        uploadedAt: true,
      },
    }),
  ]);
  return { data: rows, total, page: p, pageSize: ps };
}

export async function getGnrReport(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    msku: string | null;
    fnsku: string | null;
    orderId: string | null;
    asin: string | null;
    quantity: number;
    unitStatus: string | null;
    reasonForUnitStatus: string | null;
    usedCondition: string | null;
    valueRecoveryType: string | null;
    usedMsku: string | null;
    usedFnsku: string | null;
    lpn: string | null;
    reportDate: Date | null;
    store: string | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const { from, to } = parseDateRange(filters);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const us = filters?.unitStatus?.trim();

  const where: Prisma.GnrReportWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(from || to
      ? {
          reportDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(us
      ? { unitStatus: { equals: us, mode: "insensitive" } }
      : {}),
    ...(q
      ? {
          OR: [
            { msku: { contains: q, mode: "insensitive" } },
            { fnsku: { contains: q, mode: "insensitive" } },
            { orderId: { contains: q, mode: "insensitive" } },
            { usedMsku: { contains: q, mode: "insensitive" } },
            { usedFnsku: { contains: q, mode: "insensitive" } },
            { asin: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.gnrReport.count({ where }),
    prisma.gnrReport.findMany({
      where,
      orderBy: [{ reportDate: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        msku: true,
        fnsku: true,
        orderId: true,
        asin: true,
        quantity: true,
        unitStatus: true,
        reasonForUnitStatus: true,
        usedCondition: true,
        valueRecoveryType: true,
        usedMsku: true,
        usedFnsku: true,
        lpn: true,
        reportDate: true,
        store: true,
      },
    }),
  ]);
  return { data: rows, total, page: p, pageSize: ps };
}

export async function getPaymentRepository(
  filters?: DataExplorerFilters,
  page?: number,
  pageSize?: number,
): Promise<
  PaginatedResult<{
    postedDatetime: string | null;
    settlementId: string | null;
    lineType: string | null;
    orderId: string | null;
    sku: string | null;
    description: string | null;
    quantity: number;
    marketplace: string | null;
    productSales: string | null;
    sellingFees: string | null;
    fbaFees: string | null;
    total: string | null;
    transactionStatus: string | null;
    store: string | null;
  }>
> {
  const { skip, page: p, pageSize: ps } = normalizePagination(page, pageSize);
  const sw = storeEq(filters?.store);
  const q = filters?.search?.trim();
  const posted = parsePostedRange(filters);
  const sid = filters?.settlementId?.trim();
  const tst = filters?.transactionStatus?.trim();

  const where: Prisma.PaymentRepositoryWhereInput = {
    deletedAt: null,
    ...(sw !== undefined ? { store: sw } : {}),
    ...(posted.gte || posted.lte
      ? {
          postedDatetime: {
            ...(posted.gte ? { gte: posted.gte } : {}),
            ...(posted.lte ? { lte: posted.lte } : {}),
          },
        }
      : {}),
    ...(sid
      ? { settlementId: { contains: sid, mode: "insensitive" } }
      : {}),
    ...(tst
      ? { transactionStatus: { contains: tst, mode: "insensitive" } }
      : {}),
    ...(q
      ? {
          OR: [
            { orderId: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { settlementId: { contains: q, mode: "insensitive" } },
            { lineType: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.paymentRepository.count({ where }),
    prisma.paymentRepository.findMany({
      where,
      orderBy: [{ postedDatetime: "desc" }, { id: "desc" }],
      skip,
      take: ps,
      select: {
        postedDatetime: true,
        settlementId: true,
        lineType: true,
        orderId: true,
        sku: true,
        description: true,
        quantity: true,
        marketplace: true,
        productSales: true,
        sellingFees: true,
        fbaFees: true,
        total: true,
        transactionStatus: true,
        store: true,
      },
    }),
  ]);
  return {
    data: rows.map((r) => ({
      postedDatetime: r.postedDatetime,
      settlementId: r.settlementId,
      lineType: r.lineType,
      orderId: r.orderId,
      sku: r.sku,
      description: r.description,
      quantity: r.quantity,
      marketplace: r.marketplace,
      productSales: dec(r.productSales),
      sellingFees: dec(r.sellingFees),
      fbaFees: dec(r.fbaFees),
      total: dec(r.total),
      transactionStatus: r.transactionStatus,
      store: r.store,
    })),
    total,
    page: p,
    pageSize: ps,
  };
}

export async function getDataExplorerFilterOptions(): Promise<{
  shippedShipmentIds: string[];
  shippedCostShipmentIds: string[];
  receiptShipmentIds: string[];
  salesFc: string[];
  transferFc: string[];
  reimbReasons: string[];
  gnrUnitStatuses: string[];
}> {
  const [
    shipSids,
    shipCostSids,
    recSids,
    fcSales,
    fcXfer,
    reasons,
    gnrStatuses,
  ] = await Promise.all([
    prisma.shippedToFba.findMany({
      where: { deletedAt: null, shipmentId: { not: null } },
      distinct: ["shipmentId"],
      select: { shipmentId: true },
      orderBy: { shipmentId: "asc" },
      take: 2000,
    }),
    prisma.shippedToFba.findMany({
      where: {
        deletedAt: null,
        shipmentId: { not: null },
        perBookCostUsd: { not: null, gt: 0 },
      },
      distinct: ["shipmentId"],
      select: { shipmentId: true },
      orderBy: { shipmentId: "asc" },
      take: 2000,
    }),
    prisma.fbaReceipt.findMany({
      where: { deletedAt: null, shipmentId: { not: null } },
      distinct: ["shipmentId"],
      select: { shipmentId: true },
      orderBy: { shipmentId: "asc" },
      take: 2000,
    }),
    prisma.salesData.findMany({
      where: { deletedAt: null, fc: { not: null } },
      distinct: ["fc"],
      select: { fc: true },
      orderBy: { fc: "asc" },
      take: 500,
    }),
    prisma.fcTransfer.findMany({
      where: { deletedAt: null, fulfillmentCenter: { not: null } },
      distinct: ["fulfillmentCenter"],
      select: { fulfillmentCenter: true },
      orderBy: { fulfillmentCenter: "asc" },
      take: 500,
    }),
    prisma.reimbursement.findMany({
      where: { deletedAt: null, reason: { not: null } },
      distinct: ["reason"],
      select: { reason: true },
      orderBy: { reason: "asc" },
      take: 500,
    }),
    prisma.gnrReport.findMany({
      where: { deletedAt: null, unitStatus: { not: null } },
      distinct: ["unitStatus"],
      select: { unitStatus: true },
      orderBy: { unitStatus: "asc" },
      take: 200,
    }),
  ]);

  return {
    shippedShipmentIds: shipSids
      .map((r) => r.shipmentId)
      .filter((x): x is string => Boolean(x?.trim())),
    shippedCostShipmentIds: shipCostSids
      .map((r) => r.shipmentId)
      .filter((x): x is string => Boolean(x?.trim())),
    receiptShipmentIds: recSids
      .map((r) => r.shipmentId)
      .filter((x): x is string => Boolean(x?.trim())),
    salesFc: fcSales
      .map((r) => r.fc)
      .filter((x): x is string => Boolean(x?.trim())),
    transferFc: fcXfer
      .map((r) => r.fulfillmentCenter)
      .filter((x): x is string => Boolean(x?.trim())),
    reimbReasons: reasons
      .map((r) => r.reason)
      .filter((x): x is string => Boolean(x?.trim())),
    gnrUnitStatuses: gnrStatuses
      .map((r) => r.unitStatus)
      .filter((x): x is string => Boolean(x?.trim())),
  };
}

function fd(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

type ExplorerSummaryOpts = {
  salesView?: "fnsku" | "asin";
  fbaSummaryView?: "details" | "summary";
};

export async function getDataExplorerSummary(
  tab: DataExplorerTabId,
  filters: DataExplorerFilters | undefined,
  opts?: ExplorerSummaryOpts,
): Promise<DataExplorerSummary> {
  const sw = storeEq(filters?.store);
  const empty: DataExplorerSummary = { cards: [] };

  if (tab === "shipped_to_fba") {
    const sid = shipEq(filters?.shipmentId);
    const mskuQ = filters?.msku?.trim();
    const fnskuQ = filters?.fnsku?.trim();
    const q = filters?.search?.trim();
    const where: Prisma.ShippedToFbaWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(sid !== undefined ? { shipmentId: sid } : {}),
      ...(mskuQ ? { msku: { contains: mskuQ, mode: "insensitive" } } : {}),
      ...(fnskuQ ? { fnsku: { contains: fnskuQ, mode: "insensitive" } } : {}),
      ...(q
        ? {
            OR: [
              { msku: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
              { asin: { contains: q, mode: "insensitive" } },
              { fnsku: { contains: q, mode: "insensitive" } },
              { shipmentId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [agg, mm] = await Promise.all([
      prisma.shippedToFba.aggregate({
        where,
        _sum: { quantity: true },
      }),
      prisma.shippedToFba.findMany({
        where,
        select: { shipmentId: true, msku: true, shipDate: true },
      }),
    ]);
    const shipSet = new Set(
      mm.map((r) => r.shipmentId).filter((x): x is string => Boolean(x?.trim())),
    );
    const skuSet = new Set(
      mm.map((r) => r.msku).filter((x): x is string => Boolean(x?.trim())),
    );
    const dates = mm
      .map((r) => (r.shipDate ? r.shipDate.toISOString().slice(0, 10) : null))
      .filter((x): x is string => Boolean(x))
      .sort();
    return {
      cards: [
        {
          id: "ship",
          label: "Total Shipments",
          value: shipSet.size.toLocaleString(),
          tone: "blue",
        },
        {
          id: "sku",
          label: "Unique SKUs",
          value: skuSet.size.toLocaleString(),
          tone: "green",
        },
        {
          id: "qty",
          label: "Units Shipped",
          value: (agg._sum.quantity ?? 0).toLocaleString(),
          tone: "blue",
        },
        {
          id: "dr",
          label: "Date Range",
          value: dates[0] ?? "—",
          sub: dates.length ? `→ ${dates.at(-1) ?? "—"}` : undefined,
          tone: "yellow",
        },
      ],
    };
  }

  if (tab === "shipped_cost") {
    const sid = shipEq(filters?.shipmentId);
    const q = filters?.search?.trim();
    const { from, to } = parseDateRange(filters);
    const where: Prisma.ShippedToFbaWhereInput = {
      deletedAt: null,
      perBookCostUsd: { not: null, gt: 0 },
      ...(sw !== undefined ? { store: sw } : {}),
      ...(sid !== undefined ? { shipmentId: sid } : {}),
      ...(from || to
        ? {
            shipDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { msku: { contains: q, mode: "insensitive" } },
              { asin: { contains: q, mode: "insensitive" } },
              { fnsku: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
              { publisherName: { contains: q, mode: "insensitive" } },
              { supplierName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [agg, rows] = await Promise.all([
      prisma.shippedToFba.aggregate({
        where,
        _sum: { quantity: true, finalTotalPurchaseCostUsd: true },
        _avg: { perBookCostUsd: true },
        _max: { costUpdatedAt: true },
      }),
      prisma.shippedToFba.findMany({
        where,
        select: { shipmentId: true, msku: true },
      }),
    ]);

    const shipSet = new Set(
      rows.map((r) => r.shipmentId).filter((x): x is string => Boolean(x?.trim())),
    );
    const skuSet = new Set(
      rows.map((r) => r.msku).filter((x): x is string => Boolean(x?.trim())),
    );
    const totalLine = Number(agg._sum.finalTotalPurchaseCostUsd ?? 0);
    const avgPerBook = Number(agg._avg.perBookCostUsd ?? 0);
    const lastUpdated = agg._max.costUpdatedAt;

    return {
      cards: [
        {
          id: "ship",
          label: "Shipments w/ Cost",
          value: shipSet.size.toLocaleString(),
          tone: "blue",
        },
        {
          id: "sku",
          label: "Unique SKUs",
          value: skuSet.size.toLocaleString(),
          tone: "green",
        },
        {
          id: "qty",
          label: "Total Units",
          value: (agg._sum.quantity ?? 0).toLocaleString(),
          tone: "blue",
        },
        {
          id: "lineCost",
          label: "Total Line Cost",
          value: `$${totalLine.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          tone: "purple",
        },
        {
          id: "avgPerBook",
          label: "Avg Per Book",
          value: `$${avgPerBook.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          tone: "teal",
        },
        {
          id: "lastUp",
          label: "Last Updated",
          value: fd(lastUpdated),
          tone: "yellow",
        },
      ],
    };
  }

  if (tab === "sales_data") {
    const { from, to } = parseDateRange(filters);
    const fc = filters?.fc?.trim();
    const q = filters?.search?.trim();
    const where: Prisma.SalesDataWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(from || to
        ? {
            saleDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(fc ? { fc } : {}),
      ...(q
        ? {
            OR: [
              { msku: { contains: q, mode: "insensitive" } },
              { fnsku: { contains: q, mode: "insensitive" } },
              { orderId: { contains: q, mode: "insensitive" } },
              { asin: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    if (opts?.salesView === "asin") {
      const countRows = await prisma.$queryRaw<[{ n: bigint }]>`
        WITH base AS (
          SELECT s.* FROM sales_data s
          WHERE s."deletedAt" IS NULL
          ${sw !== undefined ? Prisma.sql`AND s.store = ${sw}` : Prisma.empty}
          ${from ? Prisma.sql`AND s."saleDate" >= ${from}` : Prisma.empty}
          ${to ? Prisma.sql`AND s."saleDate" <= ${to}` : Prisma.empty}
          ${fc ? Prisma.sql`AND s.fc = ${fc}` : Prisma.empty}
          ${
            q
              ? Prisma.sql`AND (
            s.msku ILIKE ${"%" + q + "%"}
            OR s.fnsku ILIKE ${"%" + q + "%"}
            OR s."orderId" ILIKE ${"%" + q + "%"}
            OR s.asin ILIKE ${"%" + q + "%"}
          )`
              : Prisma.empty
          }
        )
        SELECT COUNT(*)::bigint AS n FROM (
          SELECT COALESCE(NULLIF(TRIM(asin), ''), '—') FROM base GROUP BY 1
        ) t;
      `;
      const asinGroups = Number(countRows[0]?.n ?? 0);
      const rows = await prisma.salesData.findMany({
        where,
        select: {
          orderId: true,
          quantity: true,
          saleDate: true,
          msku: true,
          asin: true,
          fnsku: true,
          fc: true,
        },
      });
      const orderIds = new Set(
        rows.map((r) => r.orderId).filter((x): x is string => Boolean(x?.trim())),
      );
      let topFc = "—";
      let topN = 0;
      const fcTally: Record<string, number> = {};
      for (const r of rows) {
        const k = (r.fc ?? "Unknown").trim() || "Unknown";
        fcTally[k] = (fcTally[k] ?? 0) + r.quantity;
      }
      for (const [k, v] of Object.entries(fcTally)) {
        if (v > topN) {
          topN = v;
          topFc = k;
        }
      }
      const dates = rows
        .map((r) => (r.saleDate ? r.saleDate.toISOString().slice(0, 10) : null))
        .filter((x): x is string => Boolean(x))
        .sort();
      const mskuSet = new Set(
        rows.map((r) => r.msku).filter((x): x is string => Boolean(x?.trim())),
      );
      return {
        cards: [
          {
            id: "ord",
            label: "Total Orders",
            value: orderIds.size.toLocaleString(),
            tone: "blue",
          },
          {
            id: "units",
            label: "Units Sold",
            value: rows.reduce((s, r) => s + r.quantity, 0).toLocaleString(),
            tone: "green",
          },
          {
            id: "msku",
            label: "Unique SKUs",
            value: mskuSet.size.toLocaleString(),
            tone: "teal",
          },
          {
            id: "asin",
            label: "Unique ASINs",
            value: asinGroups.toLocaleString(),
            tone: "purple",
          },
          {
            id: "fc",
            label: "Top FC",
            value: topFc,
            tone: "teal",
          },
          {
            id: "dr",
            label: "Date Range",
            value: dates[0] ?? "—",
            sub: dates.length ? `→ ${dates.at(-1) ?? "—"}` : undefined,
            tone: "yellow",
          },
        ],
      };
    }
    const [sumQ, distinctMsku, distinctAsin, rowsDt] = await Promise.all([
      prisma.salesData.aggregate({
        where,
        _sum: { quantity: true },
      }),
      prisma.salesData.findMany({
        where,
        distinct: ["msku"],
        select: { msku: true },
      }),
      prisma.salesData.findMany({
        where,
        distinct: ["asin"],
        select: { asin: true },
      }),
      prisma.salesData.findMany({
        where,
        select: { orderId: true, saleDate: true },
      }),
    ]);
    const orders = new Set(
      rowsDt.map((r) => r.orderId).filter((x): x is string => Boolean(x?.trim())),
    );
    let topFc = "—";
    let topN = 0;
    const fcAgg = await prisma.salesData.groupBy({
      by: ["fc"],
      where,
      _sum: { quantity: true },
    });
    for (const g of fcAgg) {
      const k = (g.fc ?? "Unknown").trim() || "Unknown";
      const v = g._sum.quantity ?? 0;
      if (v > topN) {
        topN = v;
        topFc = k;
      }
    }
    const dates = rowsDt
      .map((r) => (r.saleDate ? r.saleDate.toISOString().slice(0, 10) : null))
      .filter((x): x is string => Boolean(x))
      .sort();
    return {
      cards: [
        {
          id: "ord",
          label: "Total Orders",
          value: orders.size.toLocaleString(),
          tone: "blue",
        },
        {
          id: "units",
          label: "Units Sold",
          value: (sumQ._sum.quantity ?? 0).toLocaleString(),
          tone: "green",
        },
        {
          id: "msku",
          label: "Unique SKUs",
          value: distinctMsku
            .filter((r) => r.msku?.trim())
            .length.toLocaleString(),
          tone: "teal",
        },
        {
          id: "asin",
          label: "Unique ASINs",
          value: distinctAsin
            .filter((r) => r.asin?.trim())
            .length.toLocaleString(),
          tone: "purple",
        },
        {
          id: "fc",
          label: "Top FC",
          value: topFc,
          tone: "teal",
        },
        {
          id: "dr",
          label: "Date Range",
          value: dates[0] ?? "—",
          sub: dates.length ? `→ ${dates.at(-1) ?? "—"}` : undefined,
          tone: "yellow",
        },
      ],
    };
  }

  if (tab === "fba_receipts") {
    const { from, to } = parseDateRange(filters);
    const sid = shipEq(filters?.shipmentId);
    const disp = filters?.disposition?.trim();
    const mskuQ = filters?.msku?.trim();
    const q = filters?.search?.trim();
    const where: Prisma.FbaReceiptWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(from || to
        ? {
            receiptDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(sid !== undefined ? { shipmentId: sid } : {}),
      ...(disp ? { disposition: { equals: disp, mode: "insensitive" } } : {}),
      ...(mskuQ ? { msku: { contains: mskuQ, mode: "insensitive" } } : {}),
      ...(q
        ? {
            OR: [
              { msku: { contains: q, mode: "insensitive" } },
              { fnsku: { contains: q, mode: "insensitive" } },
              { shipmentId: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [agg, mskuRows, dtRows] = await Promise.all([
      prisma.fbaReceipt.aggregate({ where, _sum: { quantity: true } }),
      prisma.fbaReceipt.findMany({
        where,
        distinct: ["msku"],
        select: { msku: true },
      }),
      prisma.fbaReceipt.findMany({
        where,
        select: { receiptDate: true },
      }),
    ]);
    const dates = dtRows
      .map((r) => (r.receiptDate ? r.receiptDate.toISOString().slice(0, 10) : null))
      .filter((x): x is string => Boolean(x))
      .sort();
    return {
      cards: [
        {
          id: "n",
          label: "Total Receipts",
          value: dtRows.length.toLocaleString(),
          tone: "blue",
        },
        {
          id: "sku",
          label: "Unique SKUs",
          value: mskuRows.filter((r) => r.msku?.trim()).length.toLocaleString(),
          tone: "green",
        },
        {
          id: "qty",
          label: "Units Received",
          value: (agg._sum.quantity ?? 0).toLocaleString(),
          tone: "blue",
        },
        {
          id: "dr",
          label: "Date Range",
          value: dates[0] ?? "—",
          sub: dates.length ? `→ ${dates.at(-1) ?? "—"}` : undefined,
          tone: "yellow",
        },
      ],
    };
  }

  if (tab === "customer_returns") {
    const { from, to } = parseDateRange(filters);
    const disp = filters?.disposition?.trim();
    const q = filters?.search?.trim();
    const where: Prisma.CustomerReturnWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(from || to
        ? {
            returnDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(disp
        ? { disposition: { equals: disp, mode: "insensitive" } }
        : {}),
      ...(q
        ? {
            OR: [
              { msku: { contains: q, mode: "insensitive" } },
              { fnsku: { contains: q, mode: "insensitive" } },
              { orderId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [agg, skus, dts, cnt] = await Promise.all([
      prisma.customerReturn.aggregate({ where, _sum: { quantity: true } }),
      prisma.customerReturn.findMany({
        where,
        distinct: ["msku"],
        select: { msku: true },
      }),
      prisma.customerReturn.findMany({
        where,
        select: { returnDate: true },
      }),
      prisma.customerReturn.count({ where }),
    ]);
    const dates = dts
      .map((r) => (r.returnDate ? r.returnDate.toISOString().slice(0, 10) : null))
      .filter((x): x is string => Boolean(x))
      .sort();
    return {
      cards: [
        {
          id: "n",
          label: "Total Returns",
          value: cnt.toLocaleString(),
          tone: "blue",
        },
        {
          id: "sku",
          label: "Unique SKUs",
          value: skus.filter((r) => r.msku?.trim()).length.toLocaleString(),
          tone: "green",
        },
        {
          id: "qty",
          label: "Units Returned",
          value: (agg._sum.quantity ?? 0).toLocaleString(),
          tone: "green",
        },
        {
          id: "dr",
          label: "Date Range",
          value: dates[0] ?? "—",
          sub: dates.length ? `→ ${dates.at(-1) ?? "—"}` : undefined,
          tone: "yellow",
        },
      ],
    };
  }

  if (tab === "reimbursements") {
    const { from, to } = parseDateRange(filters);
    const reasonEq = filters?.reason?.trim();
    const q = filters?.search?.trim();
    const where: Prisma.ReimbursementWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(from || to
        ? {
            approvalDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(reasonEq
        ? { reason: { equals: reasonEq, mode: "insensitive" } }
        : {}),
      ...(q
        ? {
            OR: [
              { msku: { contains: q, mode: "insensitive" } },
              { fnsku: { contains: q, mode: "insensitive" } },
              { amazonOrderId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [sumCash, sumInv, sumAmt, cnt] = await Promise.all([
      prisma.reimbursement.aggregate({ where, _sum: { qtyCash: true } }),
      prisma.reimbursement.aggregate({ where, _sum: { qtyInventory: true } }),
      prisma.reimbursement.aggregate({ where, _sum: { amount: true } }),
      prisma.reimbursement.count({ where }),
    ]);
    const totalAmt = sumAmt._sum.amount?.toString() ?? "0";
    return {
      cards: [
        {
          id: "n",
          label: "Total Reimbursements",
          value: cnt.toLocaleString(),
          tone: "blue",
        },
        {
          id: "qc",
          label: "Units (cash)",
          value: (sumCash._sum.qtyCash ?? 0).toLocaleString(),
          tone: "teal",
        },
        {
          id: "qi",
          label: "Units (inventory)",
          value: (sumInv._sum.qtyInventory ?? 0).toLocaleString(),
          tone: "teal",
        },
        {
          id: "amt",
          label: "Total Amount",
          value: Number.parseFloat(totalAmt).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          tone: "blue",
        },
      ],
    };
  }

  if (tab === "fba_removals") {
    const { from, to } = parseDateRange(filters);
    const os = filters?.orderStatus?.trim();
    const disp = filters?.disposition?.trim();
    const mskuQ = filters?.msku?.trim();
    const q = filters?.search?.trim();
    const where: Prisma.FbaRemovalWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(from || to
        ? {
            requestDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(os ? { orderStatus: { equals: os, mode: "insensitive" } } : {}),
      ...(disp ? { disposition: { equals: disp, mode: "insensitive" } } : {}),
      ...(mskuQ ? { msku: { contains: mskuQ, mode: "insensitive" } } : {}),
      ...(q ? { orderId: { contains: q, mode: "insensitive" } } : {}),
    };
    const [cnt, qtySum, skuDistinct, mmds, mms] = await Promise.all([
      prisma.fbaRemoval.count({ where }),
      prisma.fbaRemoval.aggregate({ where, _sum: { quantity: true } }),
      prisma.fbaRemoval.findMany({
        where,
        distinct: ["msku"],
        select: { msku: true },
      }),
      prisma.fbaRemoval.groupBy({
        by: ["disposition"],
        where,
        _sum: { quantity: true },
      }),
      prisma.fbaRemoval.groupBy({
        by: ["orderStatus"],
        where,
        _sum: { quantity: true },
      }),
    ]);
    const dtRows = await prisma.fbaRemoval.findMany({
      where,
      select: { requestDate: true },
    });
    const dates = dtRows
      .map((r) =>
        r.requestDate ? r.requestDate.toISOString().slice(0, 10) : null,
      )
      .filter((x): x is string => Boolean(x))
      .sort();
    return {
      cards: [
        {
          id: "o",
          label: "Total Orders",
          value: cnt.toLocaleString(),
          tone: "blue",
        },
        {
          id: "sku",
          label: "Unique SKUs",
          value: skuDistinct
            .filter((r) => r.msku?.trim())
            .length.toLocaleString(),
          tone: "green",
        },
        {
          id: "qty",
          label: "Units Removed",
          value: (qtySum._sum.quantity ?? 0).toLocaleString(),
          tone: "green",
        },
        {
          id: "dr",
          label: "Date Range",
          value: dates[0] ?? "—",
          sub: dates.length ? `→ ${dates.at(-1) ?? "—"}` : undefined,
          tone: "yellow",
        },
      ],
      miniTables: [
        {
          title: "By Disposition",
          headers: ["Disposition", "Units"],
          rows: mmds.map((r) => [
            r.disposition ?? "—",
            String(r._sum.quantity ?? 0),
          ]),
        },
        {
          title: "By Status",
          headers: ["Status", "Units"],
          rows: mms.map((r) => [
            r.orderStatus ?? "—",
            String(r._sum.quantity ?? 0),
          ]),
        },
      ],
    };
  }

  if (tab === "fc_transfers") {
    const { from, to } = parseDateRange(filters);
    const fc = filters?.fulfillmentCenter?.trim();
    const q = filters?.search?.trim();
    const where: Prisma.FcTransferWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(from || to
        ? {
            transferDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(fc ? { fulfillmentCenter: fc } : {}),
      ...(q
        ? {
            OR: [
              { msku: { contains: q, mode: "insensitive" } },
              { fnsku: { contains: q, mode: "insensitive" } },
              { referenceId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [agg, skus, dts] = await Promise.all([
      prisma.fcTransfer.aggregate({ where, _sum: { quantity: true } }),
      prisma.fcTransfer.findMany({
        where,
        distinct: ["msku"],
        select: { msku: true },
      }),
      prisma.fcTransfer.findMany({ where, select: { transferDate: true } }),
    ]);
    const dates = dts
      .map((r) =>
        r.transferDate ? r.transferDate.toISOString().slice(0, 10) : null,
      )
      .filter((x): x is string => Boolean(x))
      .sort();
    return {
      cards: [
        {
          id: "n",
          label: "Total Transfers",
          value: dts.length.toLocaleString(),
          tone: "blue",
        },
        {
          id: "sku",
          label: "Unique SKUs",
          value: skus.filter((r) => r.msku?.trim()).length.toLocaleString(),
          tone: "green",
        },
        {
          id: "qty",
          label: "Units",
          value: (agg._sum.quantity ?? 0).toLocaleString(),
          tone: "green",
        },
        {
          id: "dr",
          label: "Date Range",
          value: dates[0] ?? "—",
          sub: dates.length ? `→ ${dates.at(-1) ?? "—"}` : undefined,
          tone: "yellow",
        },
      ],
    };
  }

  if (tab === "shipment_status") {
    const st = filters?.shipmentStatus?.trim();
    const q = filters?.search?.trim();
    const where: Prisma.ShipmentStatusWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(st ? { status: { equals: st, mode: "insensitive" } } : {}),
      ...(q
        ? {
            OR: [
              { shipmentId: { contains: q, mode: "insensitive" } },
              { shipmentName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await prisma.shipmentStatus.findMany({
      where,
      select: { status: true, unitsExpected: true, unitsLocated: true },
    });
    let closed = 0,
      recv = 0,
      work = 0;
    let exp = 0,
      loc = 0;
    for (const r of rows) {
      exp += r.unitsExpected;
      loc += r.unitsLocated;
      const s = (r.status ?? "").toLowerCase();
      if (s.includes("closed")) closed++;
      else if (s.includes("receiving")) recv++;
      else if (s.includes("work")) work++;
    }
    const pct = exp > 0 ? Math.round((loc / exp) * 1000) / 10 : 0;
    return {
      cards: [
        {
          id: "t",
          label: "Total Shipments",
          value: rows.length.toLocaleString(),
          tone: "blue",
        },
        { id: "c", label: "Closed", value: closed.toLocaleString(), tone: "gray" },
        {
          id: "r",
          label: "Receiving",
          value: recv.toLocaleString(),
          tone: "blue",
        },
        {
          id: "w",
          label: "Working",
          value: work.toLocaleString(),
          tone: "yellow",
        },
        {
          id: "e",
          label: "Units Expected",
          value: exp.toLocaleString(),
          tone: "teal",
        },
        {
          id: "l",
          label: "Units Located",
          value: loc.toLocaleString(),
          tone: "green",
        },
      ],
      progressPct: pct,
      progressLabel: `${pct}% located`,
    };
  }

  if (tab === "fba_summary") {
    const { from, to } = parseDateRange(filters);
    const disp = filters?.disposition?.trim();
    const mskuQ = filters?.msku?.trim();
    const fnskuQ = filters?.fnsku?.trim();
    const q = filters?.search?.trim();
    const where: Prisma.FbaSummaryWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(from || to
        ? {
            summaryDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(disp
        ? { disposition: { equals: disp, mode: "insensitive" } }
        : {}),
      ...(mskuQ ? { msku: { contains: mskuQ, mode: "insensitive" } } : {}),
      ...(fnskuQ ? { fnsku: { contains: fnskuQ, mode: "insensitive" } } : {}),
      ...(q
        ? {
            OR: [
              { msku: { contains: q, mode: "insensitive" } },
              { fnsku: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await prisma.fbaSummary.findMany({
      where,
      select: {
        disposition: true,
        endingBalance: true,
        summaryDate: true,
        fnsku: true,
        msku: true,
        receipts: true,
        customerReturns: true,
        customerShipments: true,
      },
    });
    const sellRows = rows.filter(
      (r) => (r.disposition ?? "").toUpperCase() === "SELLABLE",
    );
    const fnskuLatest: Record<string, { d: Date; qty: number }> = {};
    for (const r of sellRows) {
      const k = r.fnsku?.trim() || r.msku?.trim() || "";
      if (!k || !r.summaryDate) continue;
      const cur = fnskuLatest[k];
      if (!cur || r.summaryDate > cur.d)
        fnskuLatest[k] = { d: r.summaryDate, qty: r.endingBalance };
    }
    const sellableBal = Object.values(fnskuLatest).reduce((s, x) => s + x.qty, 0);
    const unsellRows = rows.filter(
      (r) => (r.disposition ?? "").toUpperCase() !== "SELLABLE",
    );
    const unsellBal = unsellRows.reduce((s, r) => s + r.endingBalance, 0);
    const dispAgg = await prisma.fbaSummary.groupBy({
      by: ["disposition"],
      where,
      _sum: { endingBalance: true },
    });
    const lastDate = rows
      .map((r) => r.summaryDate)
      .filter((x): x is Date => x != null)
      .sort((a, b) => a.getTime() - b.getTime())
      .at(-1);
    return {
      cards: [
        {
          id: "s",
          label: "Sellable",
          value: sellableBal.toLocaleString(),
          tone: "green",
        },
        {
          id: "u",
          label: "Unsellable",
          value: unsellBal.toLocaleString(),
          tone: "red",
        },
        {
          id: "t",
          label: "Total Balance",
          value: (sellableBal + unsellBal).toLocaleString(),
          tone: "blue",
        },
        {
          id: "sk",
          label: "Unique SKUs",
          value: new Set(
            rows.map((r) => r.fnsku?.trim() || r.msku?.trim()).filter(Boolean),
          ).size.toLocaleString(),
          tone: "purple",
        },
        {
          id: "ld",
          label: "Last Date",
          value: lastDate ? fd(lastDate) : "—",
          tone: "yellow",
        },
      ],
      miniTables: [
        {
          title: "By Disposition",
          headers: ["Disposition", "Ending Σ"],
          rows: dispAgg.map((r) => [
            r.disposition ?? "—",
            String(r._sum.endingBalance ?? 0),
          ]),
        },
      ],
    };
  }

  if (tab === "replacements") {
    const { from, to } = parseDateRange(filters);
    const q = filters?.search?.trim();
    const where: Prisma.ReplacementWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(from || to
        ? {
            shipmentDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { msku: { contains: q, mode: "insensitive" } },
              { asin: { contains: q, mode: "insensitive" } },
              { orderId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [cnt, qty, skus, dts] = await Promise.all([
      prisma.replacement.count({ where }),
      prisma.replacement.aggregate({ where, _sum: { quantity: true } }),
      prisma.replacement.findMany({
        where,
        distinct: ["msku"],
        select: { msku: true },
      }),
      prisma.replacement.findMany({
        where,
        select: { shipmentDate: true },
      }),
    ]);
    const dates = dts
      .map((r) =>
        r.shipmentDate ? r.shipmentDate.toISOString().slice(0, 10) : null,
      )
      .filter((x): x is string => Boolean(x))
      .sort();
    return {
      cards: [
        {
          id: "n",
          label: "Replacements",
          value: cnt.toLocaleString(),
          tone: "blue",
        },
        {
          id: "sku",
          label: "Unique SKUs",
          value: skus.filter((r) => r.msku?.trim()).length.toLocaleString(),
          tone: "green",
        },
        {
          id: "qty",
          label: "Units",
          value: (qty._sum.quantity ?? 0).toLocaleString(),
          tone: "green",
        },
        {
          id: "dr",
          label: "Date Range",
          value: dates[0] ?? "—",
          sub: dates.length ? `→ ${dates.at(-1) ?? "—"}` : undefined,
          tone: "yellow",
        },
      ],
    };
  }

  if (tab === "adjustments") {
    const mskuQ = filters?.msku?.trim();
    const flagQ = filters?.flag?.trim();
    const st = filters?.adjStore?.trim();
    const where: Prisma.AdjustmentWhereInput = {
      deletedAt: null,
      ...(mskuQ ? { msku: { contains: mskuQ, mode: "insensitive" } } : {}),
      ...(flagQ ? { flag: { contains: flagQ, mode: "insensitive" } } : {}),
      ...(st ? { store: { contains: st, mode: "insensitive" } } : {}),
    };
    const [cnt, qty, skus] = await Promise.all([
      prisma.adjustment.count({ where }),
      prisma.adjustment.aggregate({ where, _sum: { quantity: true } }),
      prisma.adjustment.findMany({
        where,
        distinct: ["msku"],
        select: { msku: true },
      }),
    ]);
    return {
      cards: [
        {
          id: "n",
          label: "Rows",
          value: cnt.toLocaleString(),
          tone: "blue",
        },
        {
          id: "sku",
          label: "Unique MSKUs",
          value: skus.length.toLocaleString(),
          tone: "green",
        },
        {
          id: "qty",
          label: "Σ Quantity",
          value: (qty._sum.quantity ?? 0).toLocaleString(),
          tone: "green",
        },
      ],
    };
  }

  if (tab === "gnr_report") {
    const { from, to } = parseDateRange(filters);
    const us = filters?.unitStatus?.trim();
    const q = filters?.search?.trim();
    const where: Prisma.GnrReportWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(from || to
        ? {
            reportDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(us
        ? { unitStatus: { equals: us, mode: "insensitive" } }
        : {}),
      ...(q
        ? {
            OR: [
              { msku: { contains: q, mode: "insensitive" } },
              { fnsku: { contains: q, mode: "insensitive" } },
              { orderId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [cnt, qty, skus, dts] = await Promise.all([
      prisma.gnrReport.count({ where }),
      prisma.gnrReport.aggregate({ where, _sum: { quantity: true } }),
      prisma.gnrReport.findMany({
        where,
        distinct: ["msku"],
        select: { msku: true },
      }),
      prisma.gnrReport.findMany({ where, select: { reportDate: true } }),
    ]);
    const dates = dts
      .map((r) => (r.reportDate ? r.reportDate.toISOString().slice(0, 10) : null))
      .filter((x): x is string => Boolean(x))
      .sort();
    return {
      cards: [
        { id: "n", label: "Rows", value: cnt.toLocaleString(), tone: "blue" },
        {
          id: "sku",
          label: "Unique SKUs",
          value: skus.filter((r) => r.msku?.trim()).length.toLocaleString(),
          tone: "green",
        },
        {
          id: "qty",
          label: "Units",
          value: (qty._sum.quantity ?? 0).toLocaleString(),
          tone: "green",
        },
        {
          id: "dr",
          label: "Date Range",
          value: dates[0] ?? "—",
          sub: dates.length ? `→ ${dates.at(-1) ?? "—"}` : undefined,
          tone: "yellow",
        },
      ],
    };
  }

  if (tab === "payment_repository") {
    const posted = parsePostedRange(filters);
    const sid = filters?.settlementId?.trim();
    const tst = filters?.transactionStatus?.trim();
    const q = filters?.search?.trim();
    const where: Prisma.PaymentRepositoryWhereInput = {
      deletedAt: null,
      ...(sw !== undefined ? { store: sw } : {}),
      ...(posted.gte || posted.lte
        ? {
            postedDatetime: {
              ...(posted.gte ? { gte: posted.gte } : {}),
              ...(posted.lte ? { lte: posted.lte } : {}),
            },
          }
        : {}),
      ...(sid
        ? { settlementId: { contains: sid, mode: "insensitive" } }
        : {}),
      ...(tst
        ? { transactionStatus: { contains: tst, mode: "insensitive" } }
        : {}),
      ...(q
        ? {
            OR: [
              { orderId: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { settlementId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [cnt, sumTot, sumPs, sumSf, sumFba, datesPosted] = await Promise.all([
      prisma.paymentRepository.count({ where }),
      prisma.paymentRepository.aggregate({ where, _sum: { total: true } }),
      prisma.paymentRepository.aggregate({ where, _sum: { productSales: true } }),
      prisma.paymentRepository.aggregate({
        where,
        _sum: { sellingFees: true },
      }),
      prisma.paymentRepository.aggregate({ where, _sum: { fbaFees: true } }),
      prisma.paymentRepository.findMany({
        where,
        select: { postedDatetime: true, uploadedAt: true },
        take: 5000,
      }),
    ]);
    const num = (v: unknown) =>
      Number.parseFloat(v?.toString?.() ?? "0") || 0;
    const settlements = await prisma.paymentRepository.findMany({
      where,
      distinct: ["settlementId"],
      select: { settlementId: true },
    });
    const skus = await prisma.paymentRepository.findMany({
      where,
      distinct: ["sku"],
      select: { sku: true },
    });
    const lt = await prisma.paymentRepository.groupBy({
      by: ["lineType"],
      where,
      _count: { id: true },
    });
    const ts = await prisma.paymentRepository.groupBy({
      by: ["transactionStatus"],
      where,
      _count: { id: true },
    });
    const upd = datesPosted
      .map((r) => r.uploadedAt.toISOString().slice(0, 10))
      .sort();
    return {
      cards: [
        { id: "r", label: "Rows", value: cnt.toLocaleString(), tone: "blue" },
        {
          id: "set",
          label: "Settlements",
          value: settlements
            .filter((x) => x.settlementId?.trim())
            .length.toLocaleString(),
          tone: "teal",
        },
        {
          id: "sku",
          label: "SKUs",
          value: skus.filter((x) => x.sku?.trim()).length.toLocaleString(),
          tone: "purple",
        },
        {
          id: "tot",
          label: "Σ Total",
          value: num(sumTot._sum.total).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          tone: "blue",
        },
        {
          id: "ps",
          label: "Σ Product Sales",
          value: num(sumPs._sum.productSales).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          tone: "green",
        },
        {
          id: "sf",
          label: "Σ Selling Fees",
          value: num(sumSf._sum.sellingFees).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          tone: "orange",
        },
        {
          id: "ff",
          label: "Σ FBA Fees",
          value: num(sumFba._sum.fbaFees).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          tone: "red",
        },
        {
          id: "ur",
          label: "Upload Range",
          value: upd[0] ?? "—",
          sub: upd.length ? `→ ${upd.at(-1) ?? "—"}` : undefined,
          tone: "gray",
        },
      ],
      miniTables: [
        {
          title: "By Line Type",
          headers: ["Line Type", "Rows"],
          rows: lt.map((r) => [r.lineType ?? "—", String(r._count.id)]),
        },
        {
          title: "By Transaction Status",
          headers: ["Status", "Rows"],
          rows: ts.map((r) => [r.transactionStatus ?? "—", String(r._count.id)]),
        },
      ],
    };
  }

  return empty;
}

export async function fetchDataExplorerTab(
  tabId: DataExplorerTabId,
  filters: DataExplorerFilters | undefined,
  page: number,
  pageSize?: number,
): Promise<PaginatedResult<Record<string, unknown>>> {
  switch (tabId) {
    case "shipped_to_fba":
      return getShippedToFba(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "shipped_cost":
      return getShippedCostData(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "sales_data":
      if (filters?.salesView === "asin") {
        return getSalesDataByAsin(filters, page, pageSize) as Promise<
          PaginatedResult<Record<string, unknown>>
        >;
      }
      return getSalesData(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "fba_receipts":
      return getFbaReceipts(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "customer_returns":
      return getCustomerReturns(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "reimbursements":
      return getReimbursements(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "fba_removals":
      return getFbaRemovals(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "fc_transfers":
      return getFcTransfers(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "shipment_status":
      return getShipmentStatus(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "fba_summary":
      if (filters?.fbaSummaryView === "summary") {
        return getFbaSummaryGrouped(filters, page, pageSize) as Promise<
          PaginatedResult<Record<string, unknown>>
        >;
      }
      return getFbaSummaryDetails(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "replacements":
      return getReplacements(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "adjustments":
      return getAdjustments(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "gnr_report":
      return getGnrReport(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    case "payment_repository":
      return getPaymentRepository(filters, page, pageSize) as Promise<
        PaginatedResult<Record<string, unknown>>
      >;
    default:
      return { data: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE };
  }
}
