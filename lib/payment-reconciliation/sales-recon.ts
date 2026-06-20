export type SalesReconStatus =
  | "PAID"
  | "PARTIALLY_PAID"
  | "WAITING_PAYMENT"
  | "TAKE_ACTION"
  | "REPLACEMENT"
  | "REFUNDED";

export const OVERDUE_DAYS = 30;
export const AMOUNT_TOLERANCE = 0.05;
export const SHORT_ABS = 1.0;
export const SHORT_PCT = 0.05;
export const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface SalesReconLineItem {
  asin: string;
  msku: string;
  fnsku: string;
  fc: string;
  quantity: number;
  productAmount: number;
}

export interface SalesReconRow {
  // Sales (per unique orderId)
  orderId: string;
  saleDate: string;
  store: string;
  asin: string;
  msku: string;
  fnsku: string;
  fc: string;
  soldQty: number;
  saleValue: number;
  lineCount: number;
  lineItems: SalesReconLineItem[];

  // Settlement (Order lines)
  settlementId: string;
  multiSettlement: boolean;
  account: string;
  settlementStore: string;
  settledQty: number;
  setSales: number;
  setFbaFees: number;
  setCommission: number;
  setVarFee: number;
  setOther: number;
  setTotal: number;

  // Refund (Refund lines)
  refundQty: number;
  refundSales: number;
  refundFees: number;
  refundOther: number;
  refundTotal: number;

  // Status
  status: SalesReconStatus;
  qtyMismatch: boolean;
  amountMismatch: boolean;
  daysOld: number | null;
  netPaid: number;
}

export interface SalesReconKpis {
  totalOrders: number;
  totalSaleValue: number;
  paidCount: number;
  paidNet: number;
  partiallyPaidCount: number;
  partiallyPaidValue: number;
  waitingCount: number;
  waitingValue: number;
  takeActionCount: number;
  takeActionValue: number;
  replacementCount: number;
  replacementQty: number;
  refundedCount: number;
  refundedValue: number;
  totalFees: number;
  totalNet: number;
  reverseOrphanCount: number;
}

export interface SalesReconResult {
  rows: SalesReconRow[];
  kpis: SalesReconKpis;
}

export interface SalesReconSalesInput {
  orderId: string | null;
  saleDate: Date | null;
  store: string | null;
  asin: string | null;
  msku: string | null;
  fnsku: string | null;
  fc: string | null;
  quantity: number;
  productAmount: number | null;
}

export interface SalesReconSettlementInput {
  orderId: string | null;
  settlementId: string | null;
  accountType: string | null;
  store: string | null;
  transactionType: string | null;
  amountType: string | null;
  amountDescription: string | null;
  amount: number | null;
  quantityPurchased: number | null;
  postedDate: Date | null;
  depositDate: Date | null;
}

export interface SalesReconOptions {
  overdueDays?: number;
  referenceDate?: Date;
  amountTolerance?: number;
}

function zeroKpis(): SalesReconKpis {
  return {
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
    reverseOrphanCount: 0,
  };
}

function fmtIsoDate(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function groupBy<T, K>(items: T[], key: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = out.get(k);
    if (arr) arr.push(it);
    else out.set(k, [it]);
  }
  return out;
}

type DisplayBucket = "sales" | "fbaFees" | "commission" | "varFee" | "other";

function bucketFor(desc: string | null | undefined): DisplayBucket {
  const d = (desc ?? "").trim();
  if (d === "Principal") return "sales";
  if (d === "FBAPerUnitFulfillmentFee") return "fbaFees";
  if (d === "Commission") return "commission";
  if (d === "VariableClosingFee") return "varFee";
  return "other";
}

export function computeSalesRecon(
  salesRows: SalesReconSalesInput[],
  settlementRows: SalesReconSettlementInput[],
  opts: SalesReconOptions = {},
): SalesReconResult {
  const overdueDays = opts.overdueDays ?? OVERDUE_DAYS;
  const referenceDate = opts.referenceDate ?? new Date();
  const amountTolerance = opts.amountTolerance ?? AMOUNT_TOLERANCE;
  const refTime = referenceDate.getTime();

  const salesByOrder = groupBy(
    salesRows.filter((r) => r.orderId && r.orderId.trim() !== ""),
    (r) => r.orderId as string,
  );
  const settlementByOrder = groupBy(
    settlementRows.filter((r) => r.orderId && r.orderId.trim() !== ""),
    (r) => r.orderId as string,
  );

  const rows: SalesReconRow[] = [];
  const kpis = zeroKpis();

  for (const [orderId, sLines] of salesByOrder) {
    let soldQty = 0;
    let saleValue = 0;
    let saleDate: Date | null = null;
    const first = sLines[0];
    const asin = first?.asin ?? "";
    const msku = first?.msku ?? "";
    const fnsku = first?.fnsku ?? "";
    const fc = first?.fc ?? "";
    let store = first?.store ?? "";
    for (const s of sLines) {
      if (!store && s.store) {
        store = s.store;
        break;
      }
    }
    const lineItems: SalesReconLineItem[] = [];
    for (const s of sLines) {
      soldQty += s.quantity ?? 0;
      saleValue += s.productAmount ?? 0;
      if (!saleDate && s.saleDate) saleDate = s.saleDate;
      lineItems.push({
        asin: s.asin ?? "",
        msku: s.msku ?? "",
        fnsku: s.fnsku ?? "",
        fc: s.fc ?? "",
        quantity: s.quantity ?? 0,
        productAmount: s.productAmount ?? 0,
      });
    }

    const settLines = settlementByOrder.get(orderId) ?? [];
    const orderLines = settLines.filter(
      (l) => (l.transactionType ?? "") === "Order",
    );
    const refundLines = settLines.filter(
      (l) => (l.transactionType ?? "") === "Refund",
    );

    // Settlement (Order lines)
    const setB: Record<DisplayBucket, number> = {
      sales: 0,
      fbaFees: 0,
      commission: 0,
      varFee: 0,
      other: 0,
    };
    let settledQty = 0;
    let account = "";
    let settlementStore = "";
    const settlementIdSet = new Set<string>();
    for (const l of orderLines) {
      setB[bucketFor(l.amountDescription)] += l.amount ?? 0;
      if ((l.amountDescription ?? "") === "Principal") {
        settledQty += l.quantityPurchased ?? 0;
      }
      if (!account && l.accountType) account = l.accountType;
      if (!settlementStore && l.store) settlementStore = l.store;
      if (l.settlementId && l.settlementId.trim() !== "") {
        settlementIdSet.add(l.settlementId.trim());
      }
    }
    const setTotal =
      setB.sales + setB.fbaFees + setB.commission + setB.varFee + setB.other;

    // Refund (Refund lines)
    let refundQty = 0;
    let refundSales = 0;
    let refundFees = 0;
    let refundOther = 0;
    for (const l of refundLines) {
      const b = bucketFor(l.amountDescription);
      const amt = l.amount ?? 0;
      if (b === "sales") {
        refundSales += amt;
        refundQty += l.quantityPurchased ?? 0;
      } else if (b === "fbaFees" || b === "commission" || b === "varFee") {
        refundFees += amt;
      } else {
        refundOther += amt;
      }
      if (!account && l.accountType) account = l.accountType;
      if (!settlementStore && l.store) settlementStore = l.store;
      if (l.settlementId && l.settlementId.trim() !== "") {
        settlementIdSet.add(l.settlementId.trim());
      }
    }
    const refundTotal = refundSales + refundFees + refundOther;
    const netPaid = setTotal + refundTotal;

    const hasSettlement = orderLines.length > 0;
    const hasRefund = refundLines.length > 0;
    let daysOld: number | null = null;
    if (saleDate) {
      daysOld = Math.floor((refTime - saleDate.getTime()) / MS_PER_DAY);
    }
    const shortAmount = saleValue - setB.sales;
    const amountShort =
      shortAmount > Math.max(SHORT_ABS, SHORT_PCT * saleValue);
    const isComplete =
      settledQty >= soldQty && soldQty > 0 && !amountShort;

    const isReplacement =
      soldQty > 0 && Math.abs(saleValue) <= amountTolerance;

    let status: SalesReconStatus;
    if (isReplacement) {
      status = "REPLACEMENT";
    } else if (hasRefund && refundQty >= soldQty && soldQty > 0) {
      status = "REFUNDED";
    } else if (hasSettlement) {
      if (isComplete) {
        status = "PAID";
      } else {
        status = (daysOld ?? 0) > overdueDays ? "TAKE_ACTION" : "PARTIALLY_PAID";
      }
    } else if (hasRefund) {
      status = "REFUNDED";
    } else {
      status = (daysOld ?? 0) > overdueDays ? "TAKE_ACTION" : "WAITING_PAYMENT";
    }

    const qtyMismatch =
      (status === "PAID" ||
        status === "PARTIALLY_PAID" ||
        status === "REPLACEMENT" ||
        status === "REFUNDED") &&
      soldQty !== settledQty;
    const amountMismatch =
      (status === "PAID" || status === "PARTIALLY_PAID") &&
      Math.abs(saleValue - setB.sales) > amountTolerance;

    const settlementIds = Array.from(settlementIdSet);

    rows.push({
      orderId,
      saleDate: fmtIsoDate(saleDate),
      store,
      asin,
      msku,
      fnsku,
      fc,
      soldQty,
      saleValue,
      lineCount: lineItems.length,
      lineItems,

      settlementId: settlementIds[0] ?? "",
      multiSettlement: settlementIds.length > 1,
      account,
      settlementStore,
      settledQty,
      setSales: setB.sales,
      setFbaFees: setB.fbaFees,
      setCommission: setB.commission,
      setVarFee: setB.varFee,
      setOther: setB.other,
      setTotal,

      refundQty,
      refundSales,
      refundFees,
      refundOther,
      refundTotal,

      status,
      qtyMismatch,
      amountMismatch,
      daysOld,
      netPaid,
    });

    kpis.totalOrders += 1;
    kpis.totalSaleValue += saleValue;
    kpis.totalFees += setB.commission + setB.fbaFees + setB.varFee;
    kpis.totalNet += netPaid;
    switch (status) {
      case "PAID":
        kpis.paidCount += 1;
        kpis.paidNet += netPaid;
        break;
      case "PARTIALLY_PAID":
        kpis.partiallyPaidCount += 1;
        kpis.partiallyPaidValue += saleValue;
        break;
      case "WAITING_PAYMENT":
        kpis.waitingCount += 1;
        kpis.waitingValue += saleValue;
        break;
      case "TAKE_ACTION":
        kpis.takeActionCount += 1;
        kpis.takeActionValue += saleValue;
        break;
      case "REPLACEMENT":
        kpis.replacementCount += 1;
        kpis.replacementQty += soldQty;
        break;
      case "REFUNDED":
        kpis.refundedCount += 1;
        kpis.refundedValue += saleValue;
        break;
    }
  }

  for (const [orderId, lines] of settlementByOrder) {
    if (salesByOrder.has(orderId)) continue;
    const hasOrder = lines.some((l) => (l.transactionType ?? "") === "Order");
    if (hasOrder) kpis.reverseOrphanCount += 1;
  }

  rows.sort((a, b) => {
    if (a.saleDate !== b.saleDate) {
      return a.saleDate < b.saleDate ? 1 : -1;
    }
    return a.orderId < b.orderId ? -1 : 1;
  });

  return { rows, kpis };
}
