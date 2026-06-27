"use server";

import { prisma } from "@/lib/prisma";

export type DashboardKpiBreakdown = {
  label: string;
  value: number;
};

export type DashboardKpis = {
  totalSkus: number;
  matched: number;
  mismatches: number;
  pending: number;
  totalVariance: number;
  breakdownByStatus: DashboardKpiBreakdown[];
  topMismatchSkus: Array<{
    msku: string;
    variance: number;
    expectedQty: number;
    actualQty: number;
  }>;
  topPendingSkus: Array<{
    msku: string;
    expectedQty: number;
    actualQty: number;
  }>;
  topVarianceSkus: Array<{
    msku: string;
    variance: number;
    title: string | null;
  }>;
  lastRefreshedAt: Date | null;
};

export type DashboardRecentUpload = {
  id: string;
  reportType: string;
  filename: string;
  rowCount: number;
  rowsSkipped: number;
  uploadedAt: Date;
};

export type DashboardCoverageRow = {
  reportType: string;
  totalRows: number;
  uploadCount: number;
  lastUpload: Date | null;
};

export async function getDashboardKpis(): Promise<DashboardKpis> {
  // Chunked manually (not via runChunkedQueries) because Prisma's groupBy
  // return type depends on literal `_count._all: true` and loses that
  // discriminator when routed through the helper's tuple mapping. Two sequential
  // Promise.all groups → peak 3 concurrent vs tenant pool max=4.
  const [agg, statusGroups, topMismatch] = await Promise.all([
    prisma.reconciliationSummary.aggregate({
      _count: { _all: true },
      _sum: { variance: true },
    }),
    prisma.reconciliationSummary.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.reconciliationSummary.findMany({
      where: { status: "mismatch" },
      orderBy: { variance: "desc" },
      take: 10,
      select: {
        msku: true,
        variance: true,
        expectedQty: true,
        actualQty: true,
      },
    }),
  ]);
  const [topPending, lastRefreshed] = await Promise.all([
    prisma.reconciliationSummary.findMany({
      where: { status: "pending" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        msku: true,
        expectedQty: true,
        actualQty: true,
      },
    }),
    prisma.reconciliationSummary.findFirst({
      orderBy: { lastRefreshedAt: "desc" },
      select: { lastRefreshedAt: true },
    }),
  ]);

  const matched =
    statusGroups.find((g) => g.status === "matched")?._count._all ?? 0;
  const mismatches =
    statusGroups.find((g) => g.status === "mismatch")?._count._all ?? 0;
  const pending =
    statusGroups.find((g) => g.status === "pending")?._count._all ?? 0;

  const topVarianceRows = await prisma.reconciliationSummary.findMany({
    orderBy: { variance: "desc" },
    take: 10,
    select: { msku: true, variance: true, title: true },
    where: { NOT: { variance: 0 } },
  });

  return {
    totalSkus: agg._count._all ?? 0,
    matched,
    mismatches,
    pending,
    totalVariance: agg._sum.variance ?? 0,
    breakdownByStatus: statusGroups.map((g) => ({
      label: g.status,
      value: g._count._all,
    })),
    topMismatchSkus: topMismatch,
    topPendingSkus: topPending,
    topVarianceSkus: topVarianceRows,
    lastRefreshedAt: lastRefreshed?.lastRefreshedAt ?? null,
  };
}

export async function getDashboardRecentUploads(
  limit = 10,
): Promise<DashboardRecentUpload[]> {
  return prisma.uploadedFile.findMany({
    orderBy: { uploadedAt: "desc" },
    take: limit,
    select: {
      id: true,
      reportType: true,
      filename: true,
      rowCount: true,
      rowsSkipped: true,
      uploadedAt: true,
    },
  });
}

export async function getDashboardCoverage(): Promise<DashboardCoverageRow[]> {
  const rows = await prisma.uploadedFile.groupBy({
    by: ["reportType"],
    _sum: { rowCount: true },
    _count: { _all: true },
    _max: { uploadedAt: true },
    orderBy: { _sum: { rowCount: "desc" } },
  });

  return rows.map((r) => ({
    reportType: r.reportType,
    totalRows: r._sum.rowCount ?? 0,
    uploadCount: r._count._all,
    lastUpload: r._max.uploadedAt ?? null,
  }));
}
