"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Coins } from "lucide-react";

import {
  getSalesReconData,
  type SalesReconPayload,
} from "@/actions/sales-recon";
import { HeaderActions } from "@/components/layout/header-actions";
import {
  ColumnsMenu,
  useColumnVisibility,
  type ColumnDef as ColumnsMenuDef,
} from "@/components/shared/columns-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Pagination } from "@/components/shared/Pagination";
import { cn } from "@/lib/utils";
import {
  OVERDUE_DAYS,
  SHORT_ABS,
  SHORT_PCT,
  type SalesReconRow,
  type SalesReconStatus,
} from "@/lib/payment-reconciliation/sales-recon";

const STATUS_FILTER_ORDER: SalesReconStatus[] = [
  "PAID",
  "PARTIALLY_PAID",
  "WAITING_PAYMENT",
  "TAKE_ACTION",
  "REPLACEMENT",
  "REFUNDED",
];

const DETAIL_COLUMNS: readonly ColumnsMenuDef[] = [
  { id: "orderId", label: "Order ID" },
  { id: "saleDate", label: "Date" },
  { id: "asin", label: "ASIN" },
  { id: "msku", label: "MSKU" },
  { id: "fnsku", label: "FNSKU" },
  { id: "fc", label: "FC" },
  { id: "soldQty", label: "Qty" },
  { id: "saleValue", label: "Amount" },
  { id: "settlementId", label: "Settlement ID" },
  { id: "account", label: "Account" },
  { id: "settlementStore", label: "Store" },
  { id: "settledQty", label: "Settled Qty" },
  { id: "setSales", label: "Settled Sales" },
  { id: "setFbaFees", label: "FBA Fees" },
  { id: "setCommission", label: "Commission" },
  { id: "setVarFee", label: "Var. Fee" },
  { id: "setOther", label: "Other" },
  { id: "setTotal", label: "Settled Total" },
  { id: "refundQty", label: "Refund Qty" },
  { id: "refundSales", label: "Refund Sales" },
  { id: "refundFees", label: "Refund Fees" },
  { id: "refundTotal", label: "Refund Total" },
  { id: "status", label: "Status" },
];

const SUMMARY_COLUMNS: readonly ColumnsMenuDef[] = [
  { id: "orderQty", label: "Order Qty" },
  { id: "orderAmount", label: "Order Amount" },
  { id: "paidQty", label: "Paid Qty" },
  { id: "paidAmount", label: "Paid Amount" },
  { id: "refundQty", label: "Refund Qty" },
  { id: "refundAmount", label: "Refund Amount" },
  { id: "status", label: "Status" },
];

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtQty(v: number): string {
  return v.toLocaleString();
}

function moneyClass(v: number): string {
  if (v < 0) return "text-red-600";
  return "text-foreground";
}

const STATUS_BADGE: Record<SalesReconStatus, string> = {
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PARTIALLY_PAID: "border-amber-200 bg-amber-50 text-amber-800",
  WAITING_PAYMENT: "border-sky-200 bg-sky-50 text-sky-700",
  TAKE_ACTION: "border-red-200 bg-red-50 text-red-700",
  REPLACEMENT: "border-violet-200 bg-violet-50 text-violet-700",
  REFUNDED: "border-slate-200 bg-slate-50 text-slate-600",
};

const STATUS_LABEL: Record<SalesReconStatus, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid",
  WAITING_PAYMENT: "Waiting for Payment",
  TAKE_ACTION: "Take Action",
  REPLACEMENT: "Replacement",
  REFUNDED: "Refunded",
};


// Per-section header tint tokens. Body cells stay neutral.
const GROUP = {
  sales: {
    head: "bg-blue-100 text-blue-900",
    body: "",
  },
  settlement: {
    head: "bg-emerald-100 text-emerald-900",
    body: "",
  },
  refund: {
    head: "bg-amber-100 text-amber-900",
    body: "",
  },
  status: {
    head: "bg-slate-100 text-slate-700",
    body: "",
  },
} as const;

export function SalesReconClient({
  initialPayload,
}: {
  initialPayload: SalesReconPayload;
}) {
  const [view, setView] = React.useState<"details" | "summary">("details");
  const [detailVis, setDetailVis] = useColumnVisibility(
    "salesRecon.detailsCols",
    DETAIL_COLUMNS,
  );
  const [summaryVis, setSummaryVis] = useColumnVisibility(
    "salesRecon.summaryCols",
    SUMMARY_COLUMNS,
  );
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);
  const [activeStatuses, setActiveStatuses] = React.useState<Set<SalesReconStatus>>(
    new Set(),
  );

  const [payload, setPayload] = React.useState(initialPayload);
  const [loading, setLoading] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSalesReconData({
        from: from || null,
        to: to || null,
        statuses: activeStatuses.size > 0 ? Array.from(activeStatuses) : null,
        search: debouncedSearch || null,
      });
      setPayload(data);
    } finally {
      setLoading(false);
    }
  }, [from, to, activeStatuses, debouncedSearch]);

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void reload();
  }, [reload]);

  const toggleStatus = (s: SalesReconStatus) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setSearch("");
    setActiveStatuses(new Set());
  };

  const { rows, kpis } = payload;

  return (
    <TooltipProvider>
      <HeaderActions>
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1 text-xs font-semibold transition",
              view === "details"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setView("details")}
          >
            Details
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1 text-xs font-semibold transition",
              view === "summary"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setView("summary")}
          >
            Summary
          </button>
        </div>
        {view === "details" ? (
          <ColumnsMenu
            columns={DETAIL_COLUMNS}
            visibility={detailVis}
            onChange={setDetailVis}
          />
        ) : (
          <ColumnsMenu
            columns={SUMMARY_COLUMNS}
            visibility={summaryVis}
            onChange={setSummaryVis}
          />
        )}
      </HeaderActions>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Sales Reconciliation
            </h1>
            <p className="text-sm text-muted-foreground">
              Side-by-side sales vs settlement vs refund per order.
              {payload.referenceDate ? (
                <>
                  {" "}Reference date{" "}
                  <span className="font-mono text-xs">{payload.referenceDate}</span>.
                </>
              ) : null}
              {kpis.reverseOrphanCount > 0 ? (
                <>
                  {" "}
                  <span className="text-red-700">
                    {kpis.reverseOrphanCount.toLocaleString()} settlement orders
                    without a sales row.
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </header>

        {view === "summary" ? (
          <SummaryView
            rows={initialPayload.rows}
            referenceDate={initialPayload.referenceDate}
            visibility={summaryVis}
          />
        ) : (
          <>
        <FilterBar
          from={from}
          setFrom={setFrom}
          to={to}
          setTo={setTo}
          activeStatuses={activeStatuses}
          onToggleStatus={toggleStatus}
          onClearStatuses={() => setActiveStatuses(new Set())}
          search={search}
          setSearch={setSearch}
          onClear={clearFilters}
          onRefresh={() => void reload()}
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            label="Total Orders"
            accent="blue"
            primary={fmtQty(kpis.totalOrders)}
            secondary={fmtUsd(kpis.totalSaleValue)}
            secLabel="Sale Value"
          />
          <KpiCard
            label="Paid"
            accent="green"
            primary={fmtQty(kpis.paidCount)}
            secondary={fmtUsd(kpis.paidNet)}
            secLabel="Net"
            active={activeStatuses.has("PAID")}
            onClick={() => toggleStatus("PAID")}
          />
          <KpiCard
            label="Waiting for Payment"
            accent="blue"
            primary={fmtQty(kpis.waitingCount)}
            secondary={fmtUsd(kpis.waitingValue)}
            secLabel="Sale Value"
            active={activeStatuses.has("WAITING_PAYMENT")}
            onClick={() => toggleStatus("WAITING_PAYMENT")}
          />
          <KpiCard
            label="Take Action"
            accent="red"
            emphasize
            primary={fmtQty(kpis.takeActionCount)}
            secondary={fmtUsd(kpis.takeActionValue)}
            secLabel="Sale Value"
            active={activeStatuses.has("TAKE_ACTION")}
            onClick={() => toggleStatus("TAKE_ACTION")}
          />
          <KpiCard
            label="Partially Paid"
            accent="amber"
            primary={fmtQty(kpis.partiallyPaidCount)}
            secondary={fmtUsd(kpis.partiallyPaidValue)}
            secLabel="Sale Value"
            active={activeStatuses.has("PARTIALLY_PAID")}
            onClick={() => toggleStatus("PARTIALLY_PAID")}
          />
          <KpiCard
            label="Replacement"
            accent="violet"
            primary={fmtQty(kpis.replacementCount)}
            secondary={`${fmtQty(kpis.replacementQty)} units`}
            secLabel="Free"
            active={activeStatuses.has("REPLACEMENT")}
            onClick={() => toggleStatus("REPLACEMENT")}
          />
        </div>

        <StatusFilterChips
          active={activeStatuses}
          onToggle={toggleStatus}
          refundedCount={kpis.refundedCount}
          refundedValue={kpis.refundedValue}
        />

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <ReconTable
            key={`rt-${rows.length}-${rows[0]?.orderId ?? ""}`}
            rows={rows}
            visibility={detailVis}
          />
        )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

type MonthlyRow = {
  monthKey: string;
  label: string;
  orderCount: number;
  orderQty: number;
  orderAmount: number;
  paidQty: number;
  paidAmount: number;
  refundQty: number;
  refundAmount: number;
  monthEnd: Date | null;
  status: SalesReconStatus;
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MS_PER_DAY_LOCAL = 1000 * 60 * 60 * 24;

function monthKeyFromSaleDate(saleDate: string): {
  key: string;
  label: string;
  monthEnd: Date | null;
} {
  if (!saleDate || saleDate.length < 7) {
    return { key: "0000-00", label: "Unknown", monthEnd: null };
  }
  const y = saleDate.slice(0, 4);
  const m = saleDate.slice(5, 7);
  const mi = Math.max(0, Math.min(11, Number(m) - 1));
  // Day 0 of next month = last day of current month
  const monthEnd = new Date(Number(y), mi + 1, 0);
  return { key: `${y}-${m}`, label: `${MONTH_NAMES[mi]} ${y}`, monthEnd };
}

function monthStatus(
  orderQty: number,
  orderAmount: number,
  paidQty: number,
  paidAmount: number,
  monthEnd: Date | null,
  refTime: number,
): SalesReconStatus {
  const monthAge =
    monthEnd ? Math.floor((refTime - monthEnd.getTime()) / MS_PER_DAY_LOCAL) : 0;
  const isStale = monthAge > OVERDUE_DAYS;
  const nothingPaid = paidQty === 0 && Math.abs(paidAmount) <= SHORT_ABS;
  if (nothingPaid) {
    if (orderQty === 0) return "WAITING_PAYMENT";
    return isStale ? "TAKE_ACTION" : "WAITING_PAYMENT";
  }
  // Strict: PAID only when qty matches exactly AND amount close in EITHER direction.
  const qtyExact = paidQty === orderQty && orderQty > 0;
  const amountTolerance = Math.max(SHORT_ABS, SHORT_PCT * Math.abs(orderAmount));
  const amountClose = Math.abs(orderAmount - paidAmount) <= amountTolerance;
  if (qtyExact && amountClose) return "PAID";
  return isStale ? "TAKE_ACTION" : "PARTIALLY_PAID";
}

function aggregateMonthly(
  rows: SalesReconRow[],
  refTime: number,
): MonthlyRow[] {
  const map = new Map<
    string,
    Omit<MonthlyRow, "status">
  >();
  for (const r of rows) {
    // Replacement orders ship for free (sale value $0) — exclude entirely from
    // monthly aggregation so order/paid totals reflect real revenue traffic.
    if (r.status === "REPLACEMENT") continue;
    const { key, label, monthEnd } = monthKeyFromSaleDate(r.saleDate);
    const cur = map.get(key) ?? {
      monthKey: key,
      label,
      orderCount: 0,
      orderQty: 0,
      orderAmount: 0,
      paidQty: 0,
      paidAmount: 0,
      refundQty: 0,
      refundAmount: 0,
      monthEnd,
    };
    cur.orderCount += 1;
    cur.orderQty += r.soldQty;
    cur.orderAmount += r.saleValue;
    cur.paidQty += r.settledQty;
    cur.paidAmount += r.setSales;
    cur.refundQty += r.refundQty;
    cur.refundAmount += r.refundSales;
    map.set(key, cur);
  }
  const out: MonthlyRow[] = Array.from(map.values()).map((m) => ({
    ...m,
    status: monthStatus(
      m.orderQty,
      m.orderAmount,
      m.paidQty,
      m.paidAmount,
      m.monthEnd,
      refTime,
    ),
  }));
  return out.sort((a, b) =>
    a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0,
  );
}

function SummaryView({
  rows,
  referenceDate,
  visibility,
}: {
  rows: SalesReconRow[];
  referenceDate: string;
  visibility: Record<string, boolean>;
}) {
  const show = (id: string) => visibility[id] !== false;
  const parsed = referenceDate
    ? new Date(referenceDate + "T23:59:59").getTime()
    : 0;
  const refTime = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const monthly = React.useMemo(
    () => aggregateMonthly(rows, refTime),
    [rows, refTime],
  );

  const totals = React.useMemo(() => {
    const t = {
      orderCount: 0,
      orderQty: 0,
      orderAmount: 0,
      paidQty: 0,
      paidAmount: 0,
      refundQty: 0,
      refundAmount: 0,
    };
    for (const m of monthly) {
      t.orderCount += m.orderCount;
      t.orderQty += m.orderQty;
      t.orderAmount += m.orderAmount;
      t.paidQty += m.paidQty;
      t.paidAmount += m.paidAmount;
      t.refundQty += m.refundQty;
      t.refundAmount += m.refundAmount;
    }
    return t;
  }, [monthly]);

  if (monthly.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <span className="text-3xl">📊</span>
        <p className="text-sm font-semibold text-foreground">No data</p>
        <p className="text-xs text-muted-foreground">
          Adjust filters in Details view to populate the monthly summary.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Monthly summary</h2>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {monthly.length} month{monthly.length === 1 ? "" : "s"} · grouped by
          sale date · replacements excluded · ignores Details filters · status
          uses {OVERDUE_DAYS}-day rule vs {referenceDate || "today"}
        </span>
      </div>
      <div className="rounded-md border border-slate-200 bg-white">
        <table className="w-full caption-bottom text-xs">
          <TableHeader className="bg-slate-100">
            <TableRow>
              <TableHead className="h-auto py-1.5 align-top">
                <div className="flex flex-col">
                  <span>Month</span>
                  <span className="mt-0.5 font-mono text-[10px] font-bold text-slate-600 tabular-nums">
                    Total · {fmtQty(totals.orderCount)} orders
                  </span>
                </div>
              </TableHead>
              {show("orderQty") && (
                <TableHead className="h-auto py-1.5 text-right align-top">
                  <div className="flex flex-col items-end">
                    <span>Order Qty</span>
                    <span className="mt-0.5 font-mono text-[10px] font-bold text-slate-700 tabular-nums">
                      {fmtQty(totals.orderQty)}
                    </span>
                  </div>
                </TableHead>
              )}
              {show("orderAmount") && (
                <TableHead className="h-auto py-1.5 text-right align-top">
                  <div className="flex flex-col items-end">
                    <span>Order Amount</span>
                    <span className="mt-0.5 font-mono text-[10px] font-bold text-slate-700 tabular-nums">
                      {fmtUsd(totals.orderAmount)}
                    </span>
                  </div>
                </TableHead>
              )}
              {show("paidQty") && (
                <TableHead className="h-auto py-1.5 text-right align-top">
                  <div className="flex flex-col items-end">
                    <span>Paid Qty</span>
                    <span className="mt-0.5 font-mono text-[10px] font-bold text-slate-700 tabular-nums">
                      {fmtQty(totals.paidQty)}
                    </span>
                  </div>
                </TableHead>
              )}
              {show("paidAmount") && (
                <TableHead className="h-auto py-1.5 text-right align-top">
                  <div className="flex flex-col items-end">
                    <span>Paid Amount</span>
                    <span
                      className={cn(
                        "mt-0.5 font-mono text-[10px] font-bold tabular-nums",
                        totals.paidAmount < 0 ? "text-red-600" : "text-emerald-700",
                      )}
                    >
                      {fmtUsd(totals.paidAmount)}
                    </span>
                  </div>
                </TableHead>
              )}
              {show("refundQty") && (
                <TableHead className="h-auto py-1.5 text-right align-top">
                  <div className="flex flex-col items-end">
                    <span>Refund Qty</span>
                    <span
                      className={cn(
                        "mt-0.5 font-mono text-[10px] font-bold tabular-nums",
                        totals.refundQty > 0 ? "text-red-600" : "text-slate-400",
                      )}
                    >
                      {totals.refundQty === 0 ? "—" : fmtQty(totals.refundQty)}
                    </span>
                  </div>
                </TableHead>
              )}
              {show("refundAmount") && (
                <TableHead className="h-auto py-1.5 text-right align-top">
                  <div className="flex flex-col items-end">
                    <span>Refund Amount</span>
                    <span
                      className={cn(
                        "mt-0.5 font-mono text-[10px] font-bold tabular-nums",
                        totals.refundAmount !== 0 ? "text-red-600" : "text-slate-400",
                      )}
                    >
                      {totals.refundAmount === 0 ? "—" : fmtUsd(totals.refundAmount)}
                    </span>
                  </div>
                </TableHead>
              )}
              {show("status") && (
                <TableHead className="h-auto py-1.5 align-top">Status</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthly.map((m) => (
              <TableRow key={m.monthKey}>
                <TableCell className="font-medium">
                  {m.label}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    · {m.orderCount} orders
                  </span>
                </TableCell>
                {show("orderQty") && (
                  <TableCell className="text-right font-mono">
                    {fmtQty(m.orderQty)}
                  </TableCell>
                )}
                {show("orderAmount") && (
                  <TableCell className="text-right font-mono font-semibold">
                    {fmtUsd(m.orderAmount)}
                  </TableCell>
                )}
                {show("paidQty") && (
                  <TableCell className="text-right font-mono">
                    {fmtQty(m.paidQty)}
                  </TableCell>
                )}
                {show("paidAmount") && (
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      m.paidAmount < 0 ? "text-red-600" : "text-emerald-700",
                    )}
                  >
                    {fmtUsd(m.paidAmount)}
                  </TableCell>
                )}
                {show("refundQty") && (
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      m.refundQty > 0 ? "text-red-600" : "text-slate-400",
                    )}
                  >
                    {m.refundQty === 0 ? "—" : fmtQty(m.refundQty)}
                  </TableCell>
                )}
                {show("refundAmount") && (
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      m.refundAmount !== 0 ? "text-red-600" : "text-slate-400",
                    )}
                  >
                    {m.refundAmount === 0 ? "—" : fmtUsd(m.refundAmount)}
                  </TableCell>
                )}
                {show("status") && (
                  <TableCell>
                    <Badge
                      className={cn(
                        "rounded-full border font-mono text-[10px]",
                        STATUS_BADGE[m.status],
                      )}
                    >
                      {STATUS_LABEL[m.status]}
                    </Badge>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  );
}

function FilterBar({
  from,
  setFrom,
  to,
  setTo,
  activeStatuses,
  onToggleStatus,
  onClearStatuses,
  search,
  setSearch,
  onClear,
  onRefresh,
}: {
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
  activeStatuses: Set<SalesReconStatus>;
  onToggleStatus: (s: SalesReconStatus) => void;
  onClearStatuses: () => void;
  search: string;
  setSearch: (v: string) => void;
  onClear: () => void;
  onRefresh: () => void;
}) {
  const triggerLabel =
    activeStatuses.size === 0
      ? "All statuses"
      : activeStatuses.size === 1
        ? STATUS_LABEL[Array.from(activeStatuses)[0]]
        : `${activeStatuses.size} selected`;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="text-[11px] font-semibold text-muted-foreground">From</span>
      <Input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="h-8 w-[140px] text-xs"
      />
      <span className="text-[11px] font-semibold text-muted-foreground">To</span>
      <Input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="h-8 w-[140px] text-xs"
      />
      <span className="text-[11px] font-semibold text-muted-foreground">Status</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-8 min-w-[180px] items-center justify-between gap-2 rounded-md border px-2.5 text-xs transition",
              activeStatuses.size > 0
                ? "border-blue-300 bg-blue-50 text-blue-800"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Filter by status
            </span>
            <button
              type="button"
              onClick={onClearStatuses}
              className="text-[10px] font-semibold text-blue-600 hover:underline disabled:text-slate-300"
              disabled={activeStatuses.size === 0}
            >
              Clear
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            {STATUS_FILTER_ORDER.map((s) => {
              const checked = activeStatuses.has(s);
              return (
                <label
                  key={s}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleStatus(s)}
                    className="size-3.5 accent-blue-600"
                  />
                  <span
                    className={cn(
                      "inline-flex h-4 items-center rounded-full border px-1.5 font-mono text-[9px]",
                      STATUS_BADGE[s],
                    )}
                  >
                    {STATUS_LABEL[s]}
                  </span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Order ID / MSKU / SKU / Store"
        className="h-8 max-w-[280px] text-xs"
      />
      <Button
        variant="outline"
        size="sm"
        className="ml-auto text-xs"
        onClick={onClear}
      >
        Clear
      </Button>
      <Button variant="outline" size="sm" className="text-xs" onClick={onRefresh}>
        ↻ Refresh
      </Button>
    </div>
  );
}

type KpiAccent = "blue" | "green" | "red" | "amber" | "slate" | "teal" | "violet";

function KpiCard({
  label,
  accent,
  primary,
  secondary,
  secLabel,
  active,
  emphasize,
  onClick,
}: {
  label: string;
  accent: KpiAccent;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  secLabel: string;
  active?: boolean;
  emphasize?: boolean;
  onClick?: () => void;
}) {
  const b =
    accent === "blue"
      ? "border-t-blue-600"
      : accent === "green"
        ? "border-t-emerald-500"
        : accent === "red"
          ? "border-t-red-500"
          : accent === "amber"
            ? "border-t-amber-500"
            : accent === "teal"
              ? "border-t-teal-500"
              : accent === "violet"
                ? "border-t-violet-500"
                : "border-t-slate-400";
  const c =
    accent === "blue"
      ? "text-blue-600"
      : accent === "green"
        ? "text-emerald-700"
        : accent === "red"
          ? "text-red-600"
          : accent === "amber"
            ? "text-amber-800"
            : accent === "teal"
              ? "text-teal-700"
              : accent === "violet"
                ? "text-violet-700"
                : "text-slate-600";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex flex-col rounded-md border border-slate-200 bg-white px-2 py-1 text-left shadow-sm transition border-t-2",
        b,
        emphasize ? "ring-1 ring-red-100" : null,
        active ? "ring-2 ring-blue-300" : onClick ? "hover:border-slate-300" : null,
      )}
    >
      <div className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground leading-tight">
        {label}
      </div>
      <div className={cn("mt-0.5 font-mono text-sm font-bold leading-none", c)}>
        {primary}
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-1 leading-none">
        <span className={cn("font-mono text-[10px]", c)}>{secondary}</span>
        <span className="text-[8px] uppercase tracking-wide text-muted-foreground">
          {secLabel}
        </span>
      </div>
    </Tag>
  );
}

function StatusFilterChips({
  active,
  onToggle,
  refundedCount,
  refundedValue,
}: {
  active: Set<SalesReconStatus>;
  onToggle: (s: SalesReconStatus) => void;
  refundedCount: number;
  refundedValue: number;
}) {
  const refundedOn = active.has("REFUNDED");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        Also filter:
      </span>
      <button
        type="button"
        onClick={() => onToggle("REFUNDED")}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition",
          refundedOn
            ? "border-slate-400 bg-slate-100 text-slate-700"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
        )}
      >
        <span className="font-semibold">Refunded</span>
        <span className="text-slate-500">{fmtQty(refundedCount)}</span>
        <span className="text-[10px] text-slate-400">·</span>
        <span className="text-[10px] text-slate-500">{fmtUsd(refundedValue)}</span>
      </button>
    </div>
  );
}

type SortKey = "saleDate" | "orderId" | "saleValue" | "netPaid" | "status";

function ReconTable({
  rows,
  visibility,
}: {
  rows: SalesReconRow[];
  visibility: Record<string, boolean>;
}) {
  const show = (id: string) => visibility[id] !== false;
  const visibleColCount =
    1 + DETAIL_COLUMNS.filter((c) => visibility[c.id] !== false).length;
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "saleDate",
    dir: "desc",
  });

  const sorted = React.useMemo(() => {
    const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const cmpNum = (a: number, b: number) => a - b;
    const list = rows.slice();
    list.sort((a, b) => {
      let r = 0;
      switch (sort.key) {
        case "saleDate":
          r = cmpStr(a.saleDate, b.saleDate);
          break;
        case "orderId":
          r = cmpStr(a.orderId, b.orderId);
          break;
        case "saleValue":
          r = cmpNum(a.saleValue, b.saleValue);
          break;
        case "netPaid":
          r = cmpNum(a.netPaid, b.netPaid);
          break;
        case "status":
          r = cmpStr(a.status, b.status);
          break;
      }
      return sort.dir === "asc" ? r : -r;
    });
    return list;
  }, [rows, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const colTotals = React.useMemo(() => {
    const t = {
      soldQty: 0,
      saleValue: 0,
      settledQty: 0,
      setSales: 0,
      setFbaFees: 0,
      setCommission: 0,
      setVarFee: 0,
      setOther: 0,
      setTotal: 0,
      refundQty: 0,
      refundSales: 0,
      refundFees: 0,
      refundTotal: 0,
    };
    for (const r of sorted) {
      t.soldQty += r.soldQty;
      t.saleValue += r.saleValue;
      t.settledQty += r.settledQty;
      t.setSales += r.setSales;
      t.setFbaFees += r.setFbaFees;
      t.setCommission += r.setCommission;
      t.setVarFee += r.setVarFee;
      t.setOther += r.setOther;
      t.setTotal += r.setTotal;
      t.refundQty += r.refundQty;
      t.refundSales += r.refundSales;
      t.refundFees += r.refundFees;
      t.refundTotal += r.refundTotal;
    }
    return t;
  }, [sorted]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="rounded-md border border-slate-200 bg-white">
        <table className="w-full caption-bottom text-xs">
          <TableHeader className="sticky top-14 z-20 bg-white shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)]">
            <TableRow>
              <TableHead className="w-6 px-1 bg-white"></TableHead>

              {/* Sales group */}
              {show("orderId") && (
                <TableHead className={cn("h-8", GROUP.sales.head)}>
                  <SortBtn
                    active={sort.key === "orderId"}
                    dir={sort.dir}
                    onClick={() => toggleSort("orderId")}
                  >
                    Order ID
                  </SortBtn>
                </TableHead>
              )}
              {show("saleDate") && (
                <TableHead className={cn("h-8", GROUP.sales.head)}>
                  <SortBtn
                    active={sort.key === "saleDate"}
                    dir={sort.dir}
                    onClick={() => toggleSort("saleDate")}
                  >
                    Date
                  </SortBtn>
                </TableHead>
              )}
              {show("asin") && (
                <TableHead className={cn("h-8", GROUP.sales.head)}>ASIN</TableHead>
              )}
              {show("msku") && (
                <TableHead className={cn("h-8", GROUP.sales.head)}>MSKU</TableHead>
              )}
              {show("fnsku") && (
                <TableHead className={cn("h-8", GROUP.sales.head)}>FNSKU</TableHead>
              )}
              {show("fc") && (
                <TableHead className={cn("h-8", GROUP.sales.head)}>FC</TableHead>
              )}
              {show("soldQty") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.sales.head)}>
                  <HeadTotal label="Qty" total={fmtQty(colTotals.soldQty)} accent="text-blue-700" />
                </TableHead>
              )}
              {show("saleValue") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.sales.head)}>
                  <HeadTotal
                    label={
                      <SortBtn
                        active={sort.key === "saleValue"}
                        dir={sort.dir}
                        onClick={() => toggleSort("saleValue")}
                      >
                        Amount
                      </SortBtn>
                    }
                    total={fmtUsd(colTotals.saleValue)}
                    accent={colTotals.saleValue < 0 ? "text-red-600" : "text-blue-700"}
                  />
                </TableHead>
              )}

              {/* Settlement group */}
              {show("settlementId") && (
                <TableHead className={cn("h-8", GROUP.settlement.head)}>
                  Settlement ID
                </TableHead>
              )}
              {show("account") && (
                <TableHead className={cn("h-8", GROUP.settlement.head)}>
                  Account
                </TableHead>
              )}
              {show("settlementStore") && (
                <TableHead className={cn("h-8", GROUP.settlement.head)}>
                  Store
                </TableHead>
              )}
              {show("settledQty") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.settlement.head)}>
                  <HeadTotal label="Qty" total={fmtQty(colTotals.settledQty)} accent="text-emerald-700" />
                </TableHead>
              )}
              {show("setSales") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.settlement.head)}>
                  <HeadTotal label="Sales" total={fmtUsd(colTotals.setSales)} accent={colTotals.setSales < 0 ? "text-red-600" : "text-emerald-700"} />
                </TableHead>
              )}
              {show("setFbaFees") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.settlement.head)}>
                  <HeadTotal label="FBA Fees" total={fmtUsd(colTotals.setFbaFees)} accent={colTotals.setFbaFees < 0 ? "text-red-600" : "text-emerald-700"} />
                </TableHead>
              )}
              {show("setCommission") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.settlement.head)}>
                  <HeadTotal label="Commission" total={fmtUsd(colTotals.setCommission)} accent={colTotals.setCommission < 0 ? "text-red-600" : "text-emerald-700"} />
                </TableHead>
              )}
              {show("setVarFee") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.settlement.head)}>
                  <HeadTotal label="Var. Fee" total={fmtUsd(colTotals.setVarFee)} accent={colTotals.setVarFee < 0 ? "text-red-600" : "text-emerald-700"} />
                </TableHead>
              )}
              {show("setOther") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.settlement.head)}>
                  <HeadTotal label="Other" total={fmtUsd(colTotals.setOther)} accent={colTotals.setOther < 0 ? "text-red-600" : "text-emerald-700"} />
                </TableHead>
              )}
              {show("setTotal") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.settlement.head)}>
                  <HeadTotal
                    label={
                      <SortBtn
                        active={sort.key === "netPaid"}
                        dir={sort.dir}
                        onClick={() => toggleSort("netPaid")}
                      >
                        Total
                      </SortBtn>
                    }
                    total={fmtUsd(colTotals.setTotal)}
                    accent={colTotals.setTotal < 0 ? "text-red-600" : "text-emerald-700"}
                  />
                </TableHead>
              )}

              {/* Refund group */}
              {show("refundQty") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.refund.head)}>
                  <HeadTotal label="Refund Qty" total={fmtQty(colTotals.refundQty)} accent="text-amber-800" />
                </TableHead>
              )}
              {show("refundSales") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.refund.head)}>
                  <HeadTotal label="Refund Sales" total={fmtUsd(colTotals.refundSales)} accent={colTotals.refundSales < 0 ? "text-red-600" : "text-amber-800"} />
                </TableHead>
              )}
              {show("refundFees") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.refund.head)}>
                  <HeadTotal label="Refund Fees" total={fmtUsd(colTotals.refundFees)} accent={colTotals.refundFees < 0 ? "text-red-600" : "text-amber-800"} />
                </TableHead>
              )}
              {show("refundTotal") && (
                <TableHead className={cn("h-auto py-1 text-right align-top", GROUP.refund.head)}>
                  <HeadTotal label="Refund Total" total={fmtUsd(colTotals.refundTotal)} accent={colTotals.refundTotal < 0 ? "text-red-600" : "text-amber-800"} />
                </TableHead>
              )}

              {/* Status group */}
              {show("status") && (
                <TableHead className={cn("h-8", GROUP.status.head)}>
                  <SortBtn
                    active={sort.key === "status"}
                    dir={sort.dir}
                    onClick={() => toggleSort("status")}
                  >
                    Status
                  </SortBtn>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColCount}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  No orders match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              paged.map((r) => {
                const isOpen = expanded.has(r.orderId);
                const hasSettlement =
                  r.settlementId !== "" || r.settledQty !== 0 || r.setTotal !== 0;
                const hasRefund =
                  r.refundQty !== 0 || r.refundTotal !== 0;
                return (
                  <React.Fragment key={r.orderId}>
                    <TableRow>
                      <TableCell className="px-1">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? "Collapse row" : "Expand row"}
                          onClick={() => toggle(r.orderId)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                          disabled={r.lineCount <= 1}
                        >
                          {r.lineCount > 1 ? (
                            isOpen ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )
                          ) : (
                            <span className="inline-block size-3.5" />
                          )}
                        </button>
                      </TableCell>

                      {/* Sales group */}
                      {show("orderId") && (
                        <TableCell className={cn("font-mono", GROUP.sales.body)}>
                          <div className="flex items-center gap-1">
                            <span>{r.orderId}</span>
                            {r.lineCount > 1 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
                                    +{r.lineCount}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {r.lineCount} sales line items
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                        </TableCell>
                      )}
                      {show("saleDate") && (
                        <TableCell
                          className={cn(
                            "font-mono text-muted-foreground",
                            GROUP.sales.body,
                          )}
                        >
                          {r.saleDate || "—"}
                        </TableCell>
                      )}
                      {show("asin") && (
                        <TableCell className={cn("font-mono", GROUP.sales.body)}>
                          {r.asin || "—"}
                        </TableCell>
                      )}
                      {show("msku") && (
                        <TableCell className={cn("font-mono", GROUP.sales.body)}>
                          {r.msku || "—"}
                        </TableCell>
                      )}
                      {show("fnsku") && (
                        <TableCell className={cn("font-mono", GROUP.sales.body)}>
                          {r.fnsku || "—"}
                        </TableCell>
                      )}
                      {show("fc") && (
                        <TableCell className={cn("font-mono", GROUP.sales.body)}>
                          {r.fc || "—"}
                        </TableCell>
                      )}
                      {show("soldQty") && (
                        <TableCell
                          className={cn("text-right font-mono", GROUP.sales.body)}
                        >
                          {fmtQty(r.soldQty)}
                        </TableCell>
                      )}
                      {show("saleValue") && (
                        <TableCell
                          className={cn(
                            "text-right font-mono font-semibold",
                            GROUP.sales.body,
                          )}
                        >
                          {fmtUsd(r.saleValue)}
                        </TableCell>
                      )}

                      {/* Settlement group */}
                      {show("settlementId") && (
                        <SettlementCell value={hasSettlement ? r.settlementId || "—" : null}>
                          {hasSettlement && r.multiSettlement ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="ml-1 text-[10px] text-amber-600">
                                  +
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Multiple settlements for this order
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </SettlementCell>
                      )}
                      {show("account") && (
                        <SettlementCell value={hasSettlement ? r.account || "—" : null} />
                      )}
                      {show("settlementStore") && (
                        <SettlementCell
                          value={hasSettlement ? r.settlementStore || "—" : null}
                        />
                      )}
                      {show("settledQty") && (
                        <SettlementNum value={hasSettlement ? r.settledQty : null} />
                      )}
                      {show("setSales") && (
                        <SettlementMoney value={hasSettlement ? r.setSales : null} />
                      )}
                      {show("setFbaFees") && (
                        <SettlementMoney value={hasSettlement ? r.setFbaFees : null} />
                      )}
                      {show("setCommission") && (
                        <SettlementMoney value={hasSettlement ? r.setCommission : null} />
                      )}
                      {show("setVarFee") && (
                        <SettlementMoney value={hasSettlement ? r.setVarFee : null} />
                      )}
                      {show("setOther") && (
                        <SettlementMoney value={hasSettlement ? r.setOther : null} />
                      )}
                      {show("setTotal") && (
                        <TableCell
                          className={cn(
                            "text-right font-mono font-semibold",
                            GROUP.settlement.body,
                            hasSettlement ? moneyClass(r.setTotal) : "text-slate-300",
                          )}
                        >
                          {hasSettlement ? fmtUsd(r.setTotal) : "—"}
                        </TableCell>
                      )}

                      {/* Refund group */}
                      {show("refundQty") && (
                        <RefundNum value={hasRefund ? r.refundQty : null} />
                      )}
                      {show("refundSales") && (
                        <RefundMoney value={hasRefund ? r.refundSales : null} />
                      )}
                      {show("refundFees") && (
                        <RefundMoney value={hasRefund ? r.refundFees : null} />
                      )}
                      {show("refundTotal") && (
                        <TableCell
                          className={cn(
                            "text-right font-mono font-semibold",
                            GROUP.refund.body,
                            hasRefund ? moneyClass(r.refundTotal) : "text-slate-300",
                          )}
                        >
                          {hasRefund ? fmtUsd(r.refundTotal) : "—"}
                        </TableCell>
                      )}

                      {/* Status group */}
                      {show("status") && (
                        <TableCell className={GROUP.status.body}>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              className={cn(
                                "rounded-full border font-mono text-[10px]",
                                STATUS_BADGE[r.status],
                              )}
                            >
                              {STATUS_LABEL[r.status]}
                              {r.status === "TAKE_ACTION" && r.daysOld != null ? (
                                <span className="ml-1">{r.daysOld}d</span>
                              ) : null}
                            </Badge>
                            <FlagsCell row={r} />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    {isOpen && r.lineCount > 1 ? (
                      <ExpandRow row={r} colSpan={visibleColCount} />
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </table>
      </div>

      <Pagination
        page={safePage}
        pageSize={pageSize}
        totalRows={sorted.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        pageSizeOptions={[25, 50, 100]}
      />
    </div>
  );
}

function HeadTotal({
  label,
  total,
  accent,
}: {
  label: React.ReactNode;
  total: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span>{label}</span>
      <span className={cn("font-mono text-[10px] font-bold tabular-nums", accent)}>
        {total}
      </span>
    </div>
  );
}

function SortBtn({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-0.5 text-left font-semibold uppercase tracking-wide",
        "text-[10px]",
        active ? "text-foreground" : "text-current",
      )}
    >
      {children}
      {active ? (
        <span className="text-[9px]">{dir === "asc" ? "▲" : "▼"}</span>
      ) : null}
    </button>
  );
}

function SettlementCell({
  value,
  children,
}: {
  value: string | null;
  children?: React.ReactNode;
}) {
  if (value === null) {
    return (
      <TableCell className={cn("font-mono text-slate-300", GROUP.settlement.body)}>
        —
      </TableCell>
    );
  }
  return (
    <TableCell className={cn("font-mono", GROUP.settlement.body)}>
      {value}
      {children}
    </TableCell>
  );
}

function SettlementNum({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <TableCell className={cn("text-right font-mono text-slate-300", GROUP.settlement.body)}>
        —
      </TableCell>
    );
  }
  return (
    <TableCell className={cn("text-right font-mono", GROUP.settlement.body)}>
      {fmtQty(value)}
    </TableCell>
  );
}

function SettlementMoney({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <TableCell className={cn("text-right font-mono text-slate-300", GROUP.settlement.body)}>
        —
      </TableCell>
    );
  }
  return (
    <TableCell className={cn("text-right font-mono", GROUP.settlement.body, moneyClass(value))}>
      {fmtUsd(value)}
    </TableCell>
  );
}

function RefundNum({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <TableCell className={cn("text-right font-mono text-slate-300", GROUP.refund.body)}>
        —
      </TableCell>
    );
  }
  return (
    <TableCell className={cn("text-right font-mono", GROUP.refund.body)}>
      {fmtQty(value)}
    </TableCell>
  );
}

function RefundMoney({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <TableCell className={cn("text-right font-mono text-slate-300", GROUP.refund.body)}>
        —
      </TableCell>
    );
  }
  return (
    <TableCell className={cn("text-right font-mono", GROUP.refund.body, moneyClass(value))}>
      {fmtUsd(value)}
    </TableCell>
  );
}

function FlagsCell({ row }: { row: SalesReconRow }) {
  if (!row.qtyMismatch && !row.amountMismatch) return null;
  return (
    <div className="flex items-center gap-1">
      {row.qtyMismatch ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center text-amber-600">
              <AlertTriangle className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Qty mismatch — sold {row.soldQty} vs settled {row.settledQty}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {row.amountMismatch ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center text-red-600">
              <Coins className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Amount mismatch — sale {fmtUsd(row.saleValue)} vs settled sales{" "}
            {fmtUsd(row.setSales)}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function ExpandRow({ row, colSpan }: { row: SalesReconRow; colSpan: number }) {
  return (
    <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
      <TableCell colSpan={colSpan} className="p-3">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Sales line items ({row.lineCount})
        </div>
        <Table className="text-[11px]">
          <TableHeader>
            <TableRow>
              <TableHead className="h-7">ASIN</TableHead>
              <TableHead className="h-7">MSKU</TableHead>
              <TableHead className="h-7">FNSKU</TableHead>
              <TableHead className="h-7">FC</TableHead>
              <TableHead className="h-7 text-right">Qty</TableHead>
              <TableHead className="h-7 text-right">Product Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {row.lineItems.map((li, i) => (
              <TableRow key={`${li.msku}-${i}`}>
                <TableCell className="font-mono">{li.asin || "—"}</TableCell>
                <TableCell className="font-mono">{li.msku || "—"}</TableCell>
                <TableCell className="font-mono">{li.fnsku || "—"}</TableCell>
                <TableCell className="font-mono">{li.fc || "—"}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmtQty(li.quantity)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtUsd(li.productAmount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCell>
    </TableRow>
  );
}
