"use server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  PermissionLevel,
  PermissionModule,
  requireLevel,
} from "@/lib/auth/rbac";
import {
  aggregateClassifiedLines,
  classifyChargeLine,
  type FeesReimbGroup,
  type FeesReimbSummary,
} from "@/lib/payment-reconciliation/fees-reimbursements";

function dec(d: Prisma.Decimal | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  return Number(d.toString());
}

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export interface FeesReimbLine {
  id: string;
  settlementId: string | null;
  accountType: string | null;
  store: string | null;
  postedDate: string | null;
  transactionType: string | null;
  amountType: string | null;
  amountDescription: string | null;
  group: FeesReimbGroup;
  category: string;
  sku: string | null;
  shipmentId: string | null;
  quantityPurchased: number | null;
  amount: number;
}

export interface FeesReimbFilters {
  group?: FeesReimbGroup | "ALL" | null;
  accountType?: string | null;
  store?: string | null;
  settlementId?: string | null;
  search?: string | null;
}

export interface FeesReimbDataPayload {
  summary: FeesReimbSummary;
  lines: FeesReimbLine[];
}

export interface FeesReimbSettlementListItem {
  settlementId: string;
  startDate: string | null;
  endDate: string | null;
  lineCount: number;
}

function baseWhere(): Prisma.SettlementReportWhereInput {
  return {
    deletedAt: null,
    transactionType: { notIn: ["Order", "Refund"] },
  };
}

function applyScopeFilters(
  where: Prisma.SettlementReportWhereInput,
  filters: Pick<FeesReimbFilters, "accountType" | "store" | "settlementId">,
): Prisma.SettlementReportWhereInput {
  if (filters.accountType) where.accountType = filters.accountType;
  if (filters.store) where.store = filters.store;
  if (filters.settlementId) where.settlementId = filters.settlementId;
  return where;
}

function matchesSearch(line: FeesReimbLine, term: string): boolean {
  if (!term) return true;
  const q = term.toLowerCase();
  return (
    (line.amountDescription ?? "").toLowerCase().includes(q) ||
    (line.sku ?? "").toLowerCase().includes(q) ||
    (line.shipmentId ?? "").toLowerCase().includes(q) ||
    (line.category ?? "").toLowerCase().includes(q) ||
    (line.settlementId ?? "").toLowerCase().includes(q)
  );
}

export async function getFeesReimbursementsSettlementList(
  filters: Pick<FeesReimbFilters, "accountType" | "store"> = {},
): Promise<FeesReimbSettlementListItem[]> {
  await requireLevel(PermissionModule.PAYMENTS, PermissionLevel.VIEW);

  const where = applyScopeFilters(baseWhere(), filters);

  const rows = await prisma.settlementReport.findMany({
    where: { ...where, settlementId: { not: null } },
    select: {
      settlementId: true,
      settlementStartDate: true,
      settlementEndDate: true,
    },
  });

  const map = new Map<string, FeesReimbSettlementListItem>();
  for (const r of rows) {
    if (!r.settlementId) continue;
    const item = map.get(r.settlementId);
    if (item) {
      item.lineCount += 1;
    } else {
      map.set(r.settlementId, {
        settlementId: r.settlementId,
        startDate: isoDate(r.settlementStartDate),
        endDate: isoDate(r.settlementEndDate),
        lineCount: 1,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const ad = a.startDate ?? "";
    const bd = b.startDate ?? "";
    if (ad !== bd) return ad < bd ? 1 : -1;
    return a.settlementId.localeCompare(b.settlementId);
  });
}

export async function getFeesReimbursementsData(
  filters: FeesReimbFilters = {},
): Promise<FeesReimbDataPayload> {
  await requireLevel(PermissionModule.PAYMENTS, PermissionLevel.VIEW);

  const where = applyScopeFilters(baseWhere(), filters);

  const rows = await prisma.settlementReport.findMany({
    where,
    select: {
      id: true,
      settlementId: true,
      accountType: true,
      store: true,
      postedDate: true,
      transactionType: true,
      amountType: true,
      amountDescription: true,
      sku: true,
      shipmentId: true,
      quantityPurchased: true,
      amount: true,
    },
    orderBy: [{ postedDate: "desc" }, { id: "desc" }],
  });

  const allLines: FeesReimbLine[] = [];
  for (const r of rows) {
    const cls = classifyChargeLine(r.transactionType, r.amountDescription);
    if (!cls) continue;
    allLines.push({
      id: r.id,
      settlementId: r.settlementId,
      accountType: r.accountType,
      store: r.store,
      postedDate: isoDate(r.postedDate),
      transactionType: r.transactionType,
      amountType: r.amountType,
      amountDescription: r.amountDescription,
      group: cls.group,
      category: cls.category,
      sku: r.sku,
      shipmentId: r.shipmentId,
      quantityPurchased: r.quantityPurchased,
      amount: dec(r.amount),
    });
  }

  const search = (filters.search ?? "").trim();
  const searchedLines = search
    ? allLines.filter((l) => matchesSearch(l, search))
    : allLines;

  const summary = aggregateClassifiedLines(
    searchedLines.map((l) => ({
      transactionType: l.transactionType,
      amountDescription: l.amountDescription,
      amount: l.amount,
    })),
  );

  const group = filters.group;
  const scopedLines =
    !group || group === "ALL"
      ? searchedLines
      : searchedLines.filter((l) => l.group === group);

  return { summary, lines: scopedLines };
}

export interface InboundShipmentRow {
  shipmentId: string;
  dateFrom: string | null;
  dateTo: string | null;
  amountsByType: Record<string, number>;
  total: number;
}

export interface InboundShipmentPayload {
  chargeTypes: string[];
  shipments: InboundShipmentRow[];
}

const INBOUND_TYPE_ORDER = [
  "Inbound Transportation Fee",
  "FBA Inbound Placement Service Fee",
];

export async function getFeesReimbursementsInboundShipments(
  filters: Pick<
    FeesReimbFilters,
    "accountType" | "store" | "settlementId"
  > = {},
): Promise<InboundShipmentPayload> {
  await requireLevel(PermissionModule.PAYMENTS, PermissionLevel.VIEW);

  const where = applyScopeFilters(baseWhere(), filters);

  const rows = await prisma.settlementReport.findMany({
    where,
    select: {
      transactionType: true,
      amountDescription: true,
      shipmentId: true,
      postedDate: true,
      amount: true,
    },
  });

  type Agg = {
    shipmentId: string;
    minDate: Date | null;
    maxDate: Date | null;
    amountsByType: Map<string, number>;
    total: number;
  };

  const byShipment = new Map<string, Agg>();
  const typeSet = new Set<string>();

  for (const r of rows) {
    const cls = classifyChargeLine(r.transactionType, r.amountDescription);
    if (!cls || cls.group !== "INBOUND") continue;

    const shipmentId = (r.shipmentId ?? "").trim() || "(unassigned)";
    const type = cls.category;
    const amount = dec(r.amount);

    typeSet.add(type);

    let agg = byShipment.get(shipmentId);
    if (!agg) {
      agg = {
        shipmentId,
        minDate: null,
        maxDate: null,
        amountsByType: new Map(),
        total: 0,
      };
      byShipment.set(shipmentId, agg);
    }

    agg.amountsByType.set(type, (agg.amountsByType.get(type) ?? 0) + amount);
    agg.total += amount;

    if (r.postedDate) {
      if (!agg.minDate || r.postedDate < agg.minDate) agg.minDate = r.postedDate;
      if (!agg.maxDate || r.postedDate > agg.maxDate) agg.maxDate = r.postedDate;
    }
  }

  const orderedTypes: string[] = [];
  for (const preferred of INBOUND_TYPE_ORDER) {
    if (typeSet.has(preferred)) {
      orderedTypes.push(preferred);
      typeSet.delete(preferred);
    }
  }
  for (const remaining of Array.from(typeSet).sort()) {
    orderedTypes.push(remaining);
  }

  const shipments: InboundShipmentRow[] = Array.from(byShipment.values())
    .map((a) => {
      const amountsByType: Record<string, number> = {};
      for (const t of orderedTypes) {
        if (a.amountsByType.has(t)) amountsByType[t] = a.amountsByType.get(t)!;
      }
      return {
        shipmentId: a.shipmentId,
        dateFrom: isoDate(a.minDate),
        dateTo: isoDate(a.maxDate),
        amountsByType,
        total: a.total,
      };
    })
    .sort((x, y) => Math.abs(y.total) - Math.abs(x.total));

  return { chargeTypes: orderedTypes, shipments };
}

export type FeesReimbPayload = FeesReimbSummary;

export async function getFeesReimbursementsSummary(): Promise<FeesReimbPayload> {
  const { summary } = await getFeesReimbursementsData({});
  return summary;
}
