"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  deleteReceipt,
  getRemovalReconData,
  listRemovalReceipts,
  type RemovalReconciliationPayload,
  unlockReceiptRow,
  unlockRemovalRow,
} from "@/actions/removal-reconciliation";
import { HeaderActions } from "@/components/layout/header-actions";
import { useTrackPending } from "@/components/nav/nav-progress-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/loading-skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CellHoverPopover, CellHoverRow } from "@/components/shared/cell-hover-popover";
import { Pagination } from "@/components/shared/Pagination";
import { cn } from "@/lib/utils";
import {
  OrdersTable,
  ORDERS_TABLE_COLUMNS,
} from "@/components/removal-reconciliation/orders-tab/orders-table";
import {
  ReceiptsTable,
  RECEIPTS_TABLE_COLUMNS,
} from "@/components/removal-reconciliation/receipts-tab/receipts-table";
import {
  ColumnsMenu,
  useColumnVisibility,
} from "@/components/shared/columns-menu";
import { ReceiveModal } from "@/components/removal-reconciliation/modals/receive-modal";
import { RaiseCaseModal } from "@/components/removal-reconciliation/modals/raise-case-modal";
import {
  ReimbursementModal,
  type ReimbModalTarget,
} from "@/components/removal-reconciliation/modals/reimbursement-modal";
import { PostActionModal } from "@/components/removal-reconciliation/modals/post-action-modal";
import type {
  RemovalReceiptRow,
  RemovalReconRow,
} from "@/lib/removal-reconciliation/types";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

type CardKey = "all" | "received" | "awaiting" | "issue" | "reimbursed" | "case";

type OrderAggregate = {
  orderId: string;
  requestDate: string;
  orderStatus: string;
  orderType: string;
  disposition: string;
  skus: number;
  requestedQty: number;
  expectedShipped: number;
  actualShipped: number;
  receivedQty: number;
  sellableQty: number;
  unsellableQty: number;
  missingQty: number;
  reimbQty: number;
  reimbAmount: number;
  removalFee: number;
  caseCount: number;
  cases: OrderCaseDetail[];
  carriers: string;
  trackingNumbers: string;
  trackingBreakdown: OrderTrackingAgg[];
};

type OrderTrackingAgg = { tracking: string; count: number; fee: number };

type ReceiptAggregate = {
  orderId: string;
  requestDate: string;
  lines: number;
  expectedQty: number;
  receivedQty: number;
  billedQty: number;
  billedAmount: number;
  reimbQty: number;
  reimbAmount: number;
  reshippedQty: number;
  inWarehouseQty: number;
  /** Full order-level removal fee. */
  fullFee: number;
  /** Fee prorated to received units: fullFee × min(1, received/expected). */
  removalFee: number;
  status: "AWAITING" | "DISCREPANCY" | "IN_STOCK" | "CLEARED";
  overCredit: number;
};

type OrderCaseDetail = {
  fnsku: string;
  msku: string;
  caseIds: string;
  status: string;
  reimbQty: number;
  reimbAmount: number;
};

const ALL_DISP = "__all__";

export function RemovalReconciliationClient({
  initialPayload,
}: {
  initialPayload: RemovalReconciliationPayload;
}) {
  const [tab, setTab] = React.useState<"orders" | "receipts">("orders");
  const [ordersView, setOrdersView] = React.useState<"sku" | "order">("sku");
  const [receiptsView, setReceiptsView] = React.useState<"sku" | "order">("sku");
  const [ordersVis, setOrdersVis] = useColumnVisibility(
    "removalRecon.ordersCols",
    ORDERS_TABLE_COLUMNS,
  );
  const [receiptsVis, setReceiptsVis] = useColumnVisibility(
    "removalRecon.receiptsCols",
    RECEIPTS_TABLE_COLUMNS,
  );
  const [orderStatus, setOrderStatus] = React.useState("all");
  const [disposition, setDisposition] = React.useState(ALL_DISP);
  const [orderType, setOrderType] = React.useState(ALL_DISP);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);
  const [filterCard, setFilterCard] = React.useState<CardKey>("all");
  const [colTotalFilter, setColTotalFilter] = React.useState<
    null | "requestedQty" | "actualShipped" | "receivedQty" | "reimbQty" | "reimbAmount" | "removalFee"
  >(null);

  const [rows, setRows] = React.useState(initialPayload.rows);
  const [receiptRows, setReceiptRows] = React.useState(initialPayload.receiptRows);
  const [stats, setStats] = React.useState(initialPayload.stats);
  const [loading, setLoading] = React.useState(false);
  useTrackPending(loading);

  const [receiveOpen, setReceiveOpen] = React.useState(false);
  const [receiveRow, setReceiveRow] = React.useState<RemovalReconRow | null>(null);
  const [raiseCaseOpen, setRaiseCaseOpen] = React.useState(false);
  const [raiseCaseRow, setRaiseCaseRow] = React.useState<RemovalReconRow | null>(null);
  const [reimbOpen, setReimbOpen] = React.useState(false);
  const [reimbTarget, setReimbTarget] = React.useState<ReimbModalTarget | null>(null);
  const [postOpen, setPostOpen] = React.useState(false);
  const [postRow, setPostRow] = React.useState<RemovalReceiptRow | null>(null);

  const dispositionOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of initialPayload.rows) {
      if (r.disposition && r.disposition !== "—") set.add(r.disposition);
    }
    return Array.from(set).sort();
  }, [initialPayload.rows]);

  const filteredRows = React.useMemo(() => {
    if (!colTotalFilter) return rows;
    return rows.filter((r) => {
      switch (colTotalFilter) {
        case "requestedQty":
          return r.requestedQty > 0;
        case "actualShipped":
          return r.actualShipped > 0;
        case "receivedQty":
          return r.receivedQty > 0;
        case "reimbQty":
          return r.reimbQty > 0;
        case "reimbAmount":
          return r.reimbAmount > 0;
        case "removalFee":
          return r.removalFee > 0;
        default:
          return true;
      }
    });
  }, [rows, colTotalFilter]);

  const orderAggregates = React.useMemo<OrderAggregate[]>(() => {
    const g: Record<string, OrderAggregate> = {};
    const carrierSets: Record<string, Set<string>> = {};
    const trackingSets: Record<string, Set<string>> = {};
    // Per unique tracking #: line count + summed fee, scoped per order.
    const trackingStats: Record<string, Map<string, { count: number; fee: number }>> = {};
    for (const r of filteredRows) {
      const oid = r.orderId || "—";
      if (!g[oid]) {
        g[oid] = {
          orderId: oid,
          requestDate: r.requestDate,
          orderStatus: r.orderStatus,
          orderType: r.orderType,
          disposition: r.disposition,
          skus: 0,
          requestedQty: 0,
          expectedShipped: 0,
          actualShipped: 0,
          receivedQty: 0,
          sellableQty: 0,
          unsellableQty: 0,
          missingQty: 0,
          reimbQty: 0,
          reimbAmount: 0,
          removalFee: 0,
          caseCount: 0,
          cases: [],
          carriers: "",
          trackingNumbers: "",
          trackingBreakdown: [],
        };
        carrierSets[oid] = new Set();
        trackingSets[oid] = new Set();
        trackingStats[oid] = new Map();
      }
      const x = g[oid];
      x.skus += 1;
      x.requestedQty += r.requestedQty;
      x.expectedShipped += r.expectedShipped;
      x.actualShipped += r.actualShipped;
      x.receivedQty += r.receivedQty;
      x.sellableQty += r.sellableQty;
      x.unsellableQty += r.unsellableQty;
      x.missingQty += r.missingQty;
      x.reimbQty += r.reimbQty;
      x.reimbAmount += r.reimbAmount;
      x.removalFee += r.removalFee;
      x.caseCount += r.caseCount;
      if (r.caseCount > 0) {
        x.cases.push({
          fnsku: r.fnsku,
          msku: r.msku,
          caseIds: r.caseIds,
          status: r.caseStatusTop,
          reimbQty: r.reimbQty,
          reimbAmount: r.reimbAmount,
        });
      }
      for (const c of (r.carriers || "").split(/[,;|]/).map((s) => s.trim()).filter(Boolean)) {
        carrierSets[oid].add(c);
      }
      const rowTrackings = (r.trackingNumbers || "").split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
      for (const t of rowTrackings) {
        trackingSets[oid].add(t);
      }
      const keys = rowTrackings.length > 0 ? rowTrackings : ["—"];
      for (const t of keys) {
        const prev = trackingStats[oid].get(t) ?? { count: 0, fee: 0 };
        prev.count += 1;
        prev.fee += r.removalFee;
        trackingStats[oid].set(t, prev);
      }
    }
    for (const oid of Object.keys(g)) {
      g[oid].carriers = Array.from(carrierSets[oid]).join(", ");
      g[oid].trackingNumbers = Array.from(trackingSets[oid]).join(", ");
      const aggs = Array.from(trackingStats[oid], ([tracking, v]) => ({ tracking, ...v }));
      aggs.sort((a, b) => b.count - a.count || b.fee - a.fee);
      g[oid].trackingBreakdown = aggs;
    }
    return Object.values(g);
  }, [filteredRows]);

  // Receipts grouped by Removal/Order ID. Sums per-line receipt metrics into one
  // row per unique order. Billed Qty = received units on lines marked billed.
  // In-WH Qty = received − reshipped − reimbursed (units still physically held).
  const receiptAggregates = React.useMemo<ReceiptAggregate[]>(() => {
    const g: Record<string, ReceiptAggregate> = {};
    for (const r of receiptRows) {
      const oid = r.orderId || "—";
      if (!g[oid]) {
        g[oid] = {
          orderId: oid,
          requestDate: r.requestDate || "",
          lines: 0,
          expectedQty: 0,
          receivedQty: 0,
          billedQty: 0,
          billedAmount: 0,
          reimbQty: 0,
          reimbAmount: 0,
          reshippedQty: 0,
          inWarehouseQty: 0,
          fullFee: r.removalFee,
          removalFee: 0,
          status: "AWAITING",
          overCredit: 0,
        };
      }
      const x = g[oid];
      x.lines += 1;
      // Keep the latest request date seen for the order (rows arrive createdAt desc).
      if (r.requestDate && (!x.requestDate || r.requestDate > x.requestDate)) {
        x.requestDate = r.requestDate;
      }
      x.expectedQty += r.expectedQty;
      x.receivedQty += r.receivedQty;
      if (r.warehouseBilled) x.billedQty += r.receivedQty;
      x.billedAmount += r.billedAmount;
      x.reimbQty += r.reimbQty;
      x.reimbAmount += r.reimbAmount;
      x.reshippedQty += r.reshippedQty;
    }
    for (const oid of Object.keys(g)) {
      const x = g[oid];
      const rawLeftover = x.receivedQty - x.reshippedQty - x.reimbQty;
      x.inWarehouseQty = Math.max(0, rawLeftover);
      x.overCredit = Math.max(0, -rawLeftover);
      // Fee relevant only to received units: prorate full order fee by the
      // received fraction (capped at 100% so over-receipt can't inflate it).
      const recvFraction =
        x.expectedQty > 0 ? Math.min(1, x.receivedQty / x.expectedQty) : x.receivedQty > 0 ? 1 : 0;
      x.removalFee = x.fullFee * recvFraction;
      // Status priority: nothing received → awaiting; over-credited → discrepancy;
      // stock still held → in stock; otherwise fully cleared out.
      if (x.receivedQty === 0) {
        x.status = "AWAITING";
      } else if (rawLeftover < 0) {
        x.status = "DISCREPANCY";
      } else if (x.inWarehouseQty > 0) {
        x.status = "IN_STOCK";
      } else {
        x.status = "CLEARED";
      }
    }
    return Object.values(g).sort((a, b) => b.requestDate.localeCompare(a.requestDate));
  }, [receiptRows]);

  // Card-row totals for the By-Removal-ID receipts view.
  const receiptStats = React.useMemo(() => {
    const s = {
      orders: receiptAggregates.length,
      receivedQty: 0,
      inWhOrders: 0,
      inWhQty: 0,
      reimbOrders: 0,
      reimbQty: 0,
      reimbAmount: 0,
      discrepancyOrders: 0,
      overCreditQty: 0,
      receivedFee: 0,
    };
    for (const r of receiptAggregates) {
      s.receivedQty += r.receivedQty;
      s.receivedFee += r.removalFee;
      if (r.status === "IN_STOCK") s.inWhOrders += 1;
      s.inWhQty += r.inWarehouseQty;
      if (r.reimbQty > 0) s.reimbOrders += 1;
      s.reimbQty += r.reimbQty;
      s.reimbAmount += r.reimbAmount;
      if (r.status === "DISCREPANCY") s.discrepancyOrders += 1;
      s.overCreditQty += r.overCredit;
    }
    return s;
  }, [receiptAggregates]);

  function exportCsv() {
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const download = (filename: string, lines: string[]) => {
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };

    if (tab === "receipts") {
      const headers = [
        "Order Date", "Order ID", "FNSKU", "MSKU", "Tracking", "Carrier",
        "Rcvd Date", "LPN #", "Bin Location", "Item Title", "Expected", "Received",
        "Sellable", "Unsellable", "Missing", "Book Condition", "Title Note",
        "Wh. Comment", "Processed By", "Wrong Item", "Wh. Status", "Transfer To",
        "Post-Action", "Seller Status", "Seller Comments",
        "Case ID", "Case Status", "Case Remark",
        "Reimb Qty", "Reimb $", "Wh. Billed", "Billed Date", "Billed Amt", "Remarks",
      ];
      const lines = [headers.join(",")];
      for (const r of receiptRows) {
        const x = r as any;
        lines.push([
          x.requestDate, r.orderId, r.fnsku, r.msku, r.trackingNumber, r.carrier,
          r.receivedDate, x.lpnNumber, r.binLocation, r.itemTitle, r.expectedQty, r.receivedQty,
          r.sellableQty, r.unsellableQty, r.missingQty, r.conditionReceived, r.notes,
          r.warehouseComment, r.receivedBy, r.wrongItemReceived ? "YES" : "", r.whStatus, r.transferTo,
          r.postAction, r.sellerStatus, r.sellerComments,
          r.caseId, x.caseStatus ?? "", x.caseRemark ?? "",
          r.reimbQty, r.reimbAmount.toFixed(2), r.warehouseBilled ? "YES" : "NO", r.billedDate, r.billedAmount.toFixed(2), r.actionRemarks,
        ].map(esc).join(","));
      }
      download("removal_receipts.csv", lines);
      toast.success(`✅ Exported ${receiptRows.length} receipts`);
      return;
    }

    const headers = [
      "Request Date", "Order ID", "MSKU", "FNSKU", "Type", "Order Status", "Disposition",
      "Carriers", "Tracking", "Requested", "Expected", "Shipped",
      "Received", "Sellable", "Unsellable", "Missing", "Wrong Item",
      "Reimb Qty", "Reimb $", "Fee", "Status", "Case Count", "Case IDs",
    ];
    const lines = [headers.join(",")];
    for (const r of filteredRows) {
      lines.push([
        r.requestDate, r.orderId, r.msku, r.fnsku, r.orderType, r.orderStatus, r.disposition,
        r.carriers, r.trackingNumbers, r.requestedQty, r.expectedShipped, r.actualShipped,
        r.receivedQty, r.sellableQty, r.unsellableQty, r.missingQty, r.wrongItemCount,
        r.reimbQty, r.reimbAmount.toFixed(2), r.removalFee.toFixed(2), r.receiptStatus,
        r.caseCount, r.caseIds,
      ].map(esc).join(","));
    }
    download("removal_recon.csv", lines);
    toast.success("✅ CSV exported");
  }

  // Date range left empty by default — show ALL orders. User can narrow via date picker.

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRemovalReconData({
        orderStatus: orderStatus === "all" ? "" : orderStatus,
        disposition: disposition === ALL_DISP ? "" : disposition,
        orderType: orderType === ALL_DISP ? "" : orderType,
        from: from || null,
        to: to || null,
        search: debouncedSearch || undefined,
        receiptStatus: cardToFilter(filterCard),
      });
      setRows(data.rows);
      setReceiptRows(data.receiptRows);
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, [orderStatus, disposition, orderType, from, to, debouncedSearch, filterCard]);

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void reload();
  }, [reload]);

  async function refreshReceipts() {
    const rr = await listRemovalReceipts();
    setReceiptRows(rr);
  }

  async function onUnlockOrder(r: RemovalReconRow) {
    if (!confirm("Unlock this row? Clears receipt + reimb so you can re-enter.")) return;
    const res = await unlockRemovalRow(r.orderId, r.fnsku);
    if (!res.ok) {
      toast.error("Unlock failed", { description: res.error });
      return;
    }
    toast.success("🔓 Unlocked");
    await reload();
  }

  async function onUnlockReceipt(r: RemovalReceiptRow) {
    if (!confirm("Unlock this receipt? Clears action + reimb only. Receipt data preserved.")) return;
    const res = await unlockReceiptRow(r.id);
    if (!res.ok) {
      toast.error("Unlock failed", { description: res.error });
      return;
    }
    toast.success("🔓 Unlocked");
    await reload();
  }

  async function onDeleteReceipt(r: RemovalReceiptRow) {
    if (!confirm("Delete this receipt?")) return;
    const res = await deleteReceipt(r.id);
    if (!res.ok) {
      toast.error("Delete failed", { description: res.error });
      return;
    }
    toast.success("🗑 Receipt deleted");
    await reload();
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <HeaderActions>
          {tab === "orders" ? (
            <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition",
                  ordersView === "sku"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                onClick={() => setOrdersView("sku")}
              >
                By SKU
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition",
                  ordersView === "order"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                onClick={() => setOrdersView("order")}
              >
                By Removal ID
              </button>
            </div>
          ) : null}
          {tab === "receipts" ? (
            <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition",
                  receiptsView === "sku"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                onClick={() => setReceiptsView("sku")}
              >
                By SKU
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition",
                  receiptsView === "order"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                onClick={() => setReceiptsView("order")}
              >
                By Removal ID
              </button>
            </div>
          ) : null}
          {tab === "orders" && ordersView === "sku" ? (
            <ColumnsMenu
              columns={ORDERS_TABLE_COLUMNS}
              visibility={ordersVis}
              onChange={setOrdersVis}
            />
          ) : tab === "receipts" && receiptsView === "sku" ? (
            <ColumnsMenu
              columns={RECEIPTS_TABLE_COLUMNS}
              visibility={receiptsVis}
              onChange={setReceiptsVis}
            />
          ) : null}
          <Button variant="outline" size="sm" onClick={exportCsv}>
            ⬇ Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            ↻ Refresh
          </Button>
        </HeaderActions>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "orders" | "receipts")} className="gap-4">
          <TabsList className="h-9 w-full justify-start sm:w-auto">
            <TabsTrigger value="orders" className="text-xs">📋 Removal Orders</TabsTrigger>
            <TabsTrigger value="receipts" className="text-xs">📦 Receipts Log</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-0 space-y-4">
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Order Status</span>
              <Select value={orderStatus} onValueChange={setOrderStatus}>
                <SelectTrigger className="h-8 w-[140px] shrink-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Disposition</span>
              <Select value={disposition} onValueChange={setDisposition}>
                <SelectTrigger className="h-8 w-[150px] shrink-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DISP}>All</SelectItem>
                  {dispositionOptions.length > 0 ? (
                    dispositionOptions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="Sellable">Sellable</SelectItem>
                      <SelectItem value="Unsellable">Unsellable</SelectItem>
                      <SelectItem value="Damaged">Damaged</SelectItem>
                      <SelectItem value="Customer Damaged">Customer Damaged</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Type</span>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="h-8 w-[120px] shrink-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DISP}>All</SelectItem>
                  <SelectItem value="Return">Return</SelectItem>
                  <SelectItem value="Disposal">Disposal</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-[140px] shrink-0 text-xs"
                placeholder="From"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-[140px] shrink-0 text-xs"
                placeholder="To"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 MSKU / FNSKU / Order ID / Tracking"
                className="h-8 w-[240px] shrink-0 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="ml-auto shrink-0 text-xs"
                onClick={() => {
                  setOrderStatus("all");
                  setDisposition(ALL_DISP);
                  setOrderType(ALL_DISP);
                  setFrom("");
                  setTo("");
                  setSearch("");
                  setFilterCard("all");
                  setColTotalFilter(null);
                }}
              >
                Clear
              </Button>
              <span className="shrink-0 text-[11px] font-bold text-amber-700">
                Total Fee: ${stats.totalFee.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                label="Total Orders"
                border="blue"
                primary={stats.totalOrders}
                secondary={stats.totalQty}
                secLabel="Units"
                active={filterCard === "all"}
                onClick={() => setFilterCard("all")}
              />
              <KpiCard
                label="Received"
                border="green"
                primary={stats.receivedSkus}
                secondary={stats.receivedQty}
                secLabel="Units"
                active={filterCard === "received"}
                onClick={() => setFilterCard("received")}
              />
              <KpiCard
                label="Awaiting"
                border="slate"
                primary={stats.awaitingSkus}
                secondary={stats.awaitingQty}
                secLabel="Units"
                active={filterCard === "awaiting"}
                onClick={() => setFilterCard("awaiting")}
              />
              <KpiCard
                label="Partial / Missing"
                border="red"
                primary={stats.partialMissingSkus}
                secondary={stats.partialMissingQty}
                secLabel="Short"
                active={filterCard === "issue"}
                onClick={() => setFilterCard("issue")}
              />
              <KpiCard
                label="Reimbursed"
                border="teal"
                primary={stats.reimbursedSkus}
                secondary={stats.reimbursedQty}
                secLabel="Units"
                extra={`$${stats.reimbursedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                active={filterCard === "reimbursed"}
                onClick={() => setFilterCard("reimbursed")}
              />
              <KpiCard
                label="Has Case"
                border="amber"
                primary={stats.hasCaseSkus}
                secondary={stats.caseCountTotal}
                secLabel="Cases"
                active={filterCard === "case"}
                onClick={() => setFilterCard("case")}
              />
            </div>

            {loading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : ordersView === "sku" ? (
              <OrdersTable
                visibility={ordersVis}
                rows={filteredRows}
                onReceive={(r) => {
                  setReceiveRow(r);
                  setReceiveOpen(true);
                }}
                onRaiseCase={(r) => {
                  setRaiseCaseRow(r);
                  setRaiseCaseOpen(true);
                }}
                onUnlock={(r) => void onUnlockOrder(r)}
                colTotalFilter={colTotalFilter}
                onToggleColTotal={(k) =>
                  setColTotalFilter((cur) => (cur === k ? null : k))
                }
              />
            ) : (
              <OrderAggregateTable
                rows={orderAggregates}
                onDrillDown={(oid) => {
                  setSearch(oid);
                  setOrdersView("sku");
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="receipts" className="mt-0 space-y-4">
            {loading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : receiptsView === "order" ? (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <KpiCard
                    label="Received"
                    border="blue"
                    primary={receiptStats.orders}
                    primaryLabel="Orders"
                    secondary={receiptStats.receivedQty}
                    secLabel="Units"
                    extra={`Fee $${receiptStats.receivedFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  />
                  <KpiCard
                    label="In Warehouse"
                    border="green"
                    primary={receiptStats.inWhOrders}
                    primaryLabel="Orders"
                    secondary={receiptStats.inWhQty}
                    secLabel="Units"
                  />
                  <KpiCard
                    label="Reimbursed"
                    border="teal"
                    primary={receiptStats.reimbOrders}
                    primaryLabel="Orders"
                    secondary={receiptStats.reimbQty}
                    secLabel="Units"
                    extra={`$${receiptStats.reimbAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  />
                  <KpiCard
                    label="Discrepancy"
                    border="red"
                    primary={receiptStats.discrepancyOrders}
                    primaryLabel="Orders"
                    secondary={receiptStats.overCreditQty}
                    secLabel="Over"
                  />
                </div>
                <ReceiptAggregateTable rows={receiptAggregates} />
              </>
            ) : (
              <ReceiptsTable
                visibility={receiptsVis}
                rows={receiptRows}
                onPostAction={(r) => {
                  setPostRow(r);
                  setPostOpen(true);
                }}
                onReimb={(r) => {
                  setReimbTarget({
                    kind: "receipt",
                    receiptId: r.id,
                    orderId: r.orderId,
                    fnsku: r.fnsku,
                    missingQty: r.missingQty,
                  });
                  setReimbOpen(true);
                }}
                onUnlock={(r) => void onUnlockReceipt(r)}
                onDelete={(r) => void onDeleteReceipt(r)}
                onBillingSaved={() => {
                  void reload();
                  void refreshReceipts();
                }}
              />
            )}
          </TabsContent>
        </Tabs>

        <ReceiveModal
          row={receiveRow}
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          preselectCase={false}
          onSaved={() => {
            void reload();
            void refreshReceipts();
          }}
        />
        <RaiseCaseModal
          row={raiseCaseRow}
          open={raiseCaseOpen}
          onOpenChange={setRaiseCaseOpen}
          onSaved={() => {
            void reload();
            void refreshReceipts();
          }}
        />
        <ReimbursementModal
          target={reimbTarget}
          open={reimbOpen}
          onOpenChange={setReimbOpen}
          onSaved={() => {
            void reload();
            void refreshReceipts();
          }}
        />
        <PostActionModal
          receipt={postRow}
          open={postOpen}
          onOpenChange={setPostOpen}
          onSaved={() => {
            void reload();
            void refreshReceipts();
          }}
        />
      </div>
    </TooltipProvider>
  );
}

function cardToFilter(card: CardKey): string {
  switch (card) {
    case "received":
      return "COMPLETE";
    case "awaiting":
      return "AWAITING";
    case "issue":
      return "PARTIAL";
    case "reimbursed":
      return "REIMBURSED";
    case "case":
      return "HasCase";
    default:
      return "";
  }
}

function KpiCard({
  label,
  border,
  primary,
  primaryLabel = "SKUs",
  secondary,
  secLabel,
  extra,
  active,
  onClick,
}: {
  label: string;
  border: "blue" | "green" | "red" | "amber" | "slate" | "teal";
  primary: number;
  primaryLabel?: string;
  secondary: number;
  secLabel: string;
  extra?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const b =
    border === "blue"
      ? "border-t-blue-600"
      : border === "green"
        ? "border-t-emerald-500"
        : border === "red"
          ? "border-t-red-500"
          : border === "amber"
            ? "border-t-amber-500"
            : border === "teal"
              ? "border-t-teal-500"
              : "border-t-slate-400";
  const c =
    border === "blue"
      ? "text-blue-600"
      : border === "green"
        ? "text-emerald-700"
        : border === "red"
          ? "text-red-600"
          : border === "amber"
            ? "text-amber-800"
            : border === "teal"
              ? "text-teal-700"
              : "text-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition border-t-[3px]",
        b,
        active ? "ring-2 ring-blue-300" : "hover:border-slate-300",
      )}
    >
      <div className="mb-1 text-center text-[8.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex items-center justify-center gap-2">
        <div className="flex flex-col items-center">
          <span className={cn("font-mono text-lg font-bold leading-none", c)}>
            {primary.toLocaleString()}
          </span>
          <span className="mt-0.5 text-[8px] text-muted-foreground">{primaryLabel}</span>
        </div>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex flex-col items-center">
          <span className={cn("font-mono text-sm font-bold leading-none", c)}>
            {secondary.toLocaleString()}
          </span>
          <span className="mt-0.5 text-[8px] text-muted-foreground">{secLabel}</span>
        </div>
      </div>
      {extra ? (
        <div className={cn("mt-1 text-center font-mono text-[11px] font-bold leading-none", c)}>
          {extra}
        </div>
      ) : null}
    </button>
  );
}

function OrderTrackingHover({ agg }: { agg: OrderAggregate }) {
  const trackings = agg.trackingBreakdown;
  const totalCount = trackings.reduce((s, t) => s + t.count, 0);
  const totalFee = trackings.reduce((s, t) => s + t.fee, 0);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(agg.orderId).catch(() => {});
  };
  return (
    <CellHoverPopover
      trigger={
        <span className="text-blue-700 underline-offset-2 hover:underline">
          {agg.orderId}
        </span>
      }
      title="Tracking breakdown"
      count={trackings.length}
      side="right"
      width={360}
    >
      <CellHoverRow left="Order ID" right={agg.orderId} />
      <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Tracking #</span>
        <span className="text-right">Count</span>
        <span className="text-right">Fee</span>
      </div>
      {trackings.length === 0 ? (
        <div className="px-2 py-2 text-center text-[11px] text-muted-foreground">
          No tracking data
        </div>
      ) : (
        trackings.map((t) => (
          <div
            key={t.tracking}
            className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-b border-border/60 px-2 py-1 last:border-b-0"
          >
            <span className="truncate font-mono text-foreground" title={t.tracking}>
              {t.tracking}
            </span>
            <span className="text-right font-mono tabular-nums text-muted-foreground">
              {t.count}×
            </span>
            <span className="text-right font-mono tabular-nums text-muted-foreground">
              ${t.fee.toFixed(2)}
            </span>
          </div>
        ))
      )}
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-t-2 border-border px-2 py-1 font-semibold">
        <span className="text-foreground">Total</span>
        <span className="text-right font-mono tabular-nums text-foreground">
          {totalCount}×
        </span>
        <span className="text-right font-mono tabular-nums text-foreground">
          ${totalFee.toFixed(2)}
        </span>
      </div>
      <button
        type="button"
        onClick={copy}
        className="mt-1 block w-full rounded-md border border-border/60 px-2 py-1 text-[10px] hover:bg-slate-50"
      >
        📋 Copy Order ID
      </button>
    </CellHoverPopover>
  );
}

const CASE_STATUS_STYLE: Record<string, string> = {
  Open: "border-blue-200 bg-blue-50 text-blue-700",
  Pending: "border-amber-200 bg-amber-50 text-amber-700",
  Approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Closed: "border-slate-200 bg-slate-100 text-slate-600",
};

function CaseCountHover({ agg }: { agg: OrderAggregate }) {
  if (agg.caseCount === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const totalReimbQty = agg.cases.reduce((s, c) => s + c.reimbQty, 0);
  const totalReimbAmount = agg.cases.reduce((s, c) => s + c.reimbAmount, 0);
  return (
    <CellHoverPopover
      trigger={
        <span className="cursor-default font-semibold text-amber-700 underline decoration-dotted underline-offset-2">
          {agg.caseCount}
        </span>
      }
      title="Case details"
      count={agg.cases.length}
      side="left"
      width={360}
    >
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>SKU / Case</span>
        <span className="text-right">Status</span>
        <span className="text-right">Reimb $</span>
      </div>
      {agg.cases.map((c, i) => (
        <div
          key={`${c.fnsku}-${i}`}
          className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-b border-border/60 px-2 py-1 last:border-b-0"
        >
          <span className="min-w-0">
            <span className="block truncate font-mono text-foreground" title={c.fnsku}>
              {c.fnsku}
            </span>
            {c.caseIds ? (
              <span className="block truncate font-mono text-[10px] text-muted-foreground" title={c.caseIds}>
                {c.caseIds}
              </span>
            ) : null}
          </span>
          <span className="text-right">
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                CASE_STATUS_STYLE[c.status] ?? "border-slate-200 bg-slate-50 text-slate-600",
              )}
            >
              {c.status || "—"}
            </span>
          </span>
          <span className="text-right font-mono tabular-nums text-emerald-700">
            {c.reimbAmount > 0 ? `$${c.reimbAmount.toFixed(2)}` : "—"}
            {c.reimbQty > 0 ? (
              <span className="block text-[9px] text-muted-foreground">{c.reimbQty} u</span>
            ) : null}
          </span>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-t-2 border-border px-2 py-1 font-semibold">
        <span className="text-foreground">Total</span>
        <span className="text-right font-mono tabular-nums text-muted-foreground">
          {totalReimbQty > 0 ? `${totalReimbQty} u` : ""}
        </span>
        <span className="text-right font-mono tabular-nums text-foreground">
          {totalReimbAmount > 0 ? `$${totalReimbAmount.toFixed(2)}` : "—"}
        </span>
      </div>
    </CellHoverPopover>
  );
}

function OrderAggregateTable({
  rows,
  onDrillDown,
}: {
  rows: OrderAggregate[];
  onDrillDown?: (orderId: string) => void;
}) {
  const totals = React.useMemo(() => {
    let requestedQty = 0;
    let actualShipped = 0;
    let receivedQty = 0;
    let missingQty = 0;
    let reimbQty = 0;
    let reimbAmount = 0;
    let removalFee = 0;
    for (const r of rows) {
      requestedQty += r.requestedQty;
      actualShipped += r.actualShipped;
      receivedQty += r.receivedQty;
      missingQty += r.missingQty;
      reimbQty += r.reimbQty;
      reimbAmount += r.reimbAmount;
      removalFee += r.removalFee;
    }
    return {
      requestedQty,
      actualShipped,
      receivedQty,
      missingQty,
      reimbQty,
      reimbAmount,
      removalFee,
    };
  }, [rows]);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="text-[11px]">Order ID</TableHead>
            <TableHead className="text-[11px]">Request Date</TableHead>
            <TableHead className="text-[11px]">Type</TableHead>
            <TableHead className="text-[11px]">Order Status</TableHead>
            <TableHead className="text-[11px]">Disposition</TableHead>
            <TableHead className="text-[11px]">Carriers</TableHead>
            <TableHead className="text-right text-[11px]">SKUs</TableHead>
            <TableHead className="text-right text-[11px]">
              Requested
              <div className="text-[10px] font-normal text-muted-foreground">
                {totals.requestedQty.toLocaleString()}
              </div>
            </TableHead>
            <TableHead className="text-right text-[11px]">
              Shipped
              <div className="text-[10px] font-normal text-muted-foreground">
                {totals.actualShipped.toLocaleString()}
              </div>
            </TableHead>
            <TableHead className="text-right text-[11px]">
              Received
              <div className="text-[10px] font-normal text-muted-foreground">
                {totals.receivedQty.toLocaleString()}
              </div>
            </TableHead>
            <TableHead className="text-right text-[11px]">
              Missing
              <div className="text-[10px] font-normal text-muted-foreground">
                {totals.missingQty.toLocaleString()}
              </div>
            </TableHead>
            <TableHead className="text-right text-[11px]">
              Reimb.
              <div className="text-[10px] font-normal text-muted-foreground">
                {totals.reimbQty.toLocaleString()}
              </div>
            </TableHead>
            <TableHead className="text-right text-[11px]">
              Reimb $
              <div className="text-[10px] font-normal text-muted-foreground">
                ${totals.reimbAmount.toFixed(2)}
              </div>
            </TableHead>
            <TableHead className="text-right text-[11px]">
              Fee
              <div className="text-[10px] font-normal text-muted-foreground">
                ${totals.removalFee.toFixed(2)}
              </div>
            </TableHead>
            <TableHead className="text-right text-[11px]">Cases</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={14}
                className="py-10 text-center text-xs text-muted-foreground"
              >
                No orders
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const pct =
                r.actualShipped > 0
                  ? Math.round((r.receivedQty / r.actualShipped) * 100)
                  : r.requestedQty > 0
                    ? Math.round((r.receivedQty / r.requestedQty) * 100)
                    : 100;
              const pColor =
                pct >= 100
                  ? "text-emerald-600"
                  : pct >= 85
                    ? "text-amber-600"
                    : "text-red-600";
              return (
                <TableRow
                  key={r.orderId}
                  className={cn(
                    "text-xs",
                    onDrillDown ? "cursor-pointer hover:bg-blue-50" : undefined,
                  )}
                  onClick={() => onDrillDown?.(r.orderId)}
                  title={onDrillDown ? "Click to view SKUs in this order" : undefined}
                >
                  <TableCell
                    className="font-mono font-semibold"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <OrderTrackingHover agg={r} />
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {r.requestDate}
                  </TableCell>
                  <TableCell>{r.orderType}</TableCell>
                  <TableCell>
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {r.orderStatus}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700">
                      {r.disposition}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate text-[10px] text-muted-foreground">
                    {r.carriers}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.skus}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.requestedQty}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.actualShipped}
                  </TableCell>
                  <TableCell className={cn("text-right font-mono", pColor)}>
                    {r.receivedQty}
                    <div className="text-[9px] text-muted-foreground">
                      {pct}%
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      r.missingQty > 0 ? "font-bold text-red-600" : "text-emerald-600",
                    )}
                  >
                    {r.missingQty || 0}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-700">
                    {r.reimbQty || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-700">
                    {r.reimbAmount > 0 ? `$${r.reimbAmount.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-amber-700">
                    ${r.removalFee.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className="text-right font-mono"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <CaseCountHover agg={r} />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ReceiptAggregateTable({ rows }: { rows: ReceiptAggregate[] }) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  React.useEffect(() => { setPage(1); }, [rows]);
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const totals = React.useMemo(() => {
    const t = {
      expectedQty: 0,
      receivedQty: 0,
      billedQty: 0,
      billedAmount: 0,
      reimbQty: 0,
      reimbAmount: 0,
      reshippedQty: 0,
      inWarehouseQty: 0,
      removalFee: 0,
    };
    for (const r of rows) {
      t.expectedQty += r.expectedQty;
      t.removalFee += r.removalFee;
      t.receivedQty += r.receivedQty;
      t.billedQty += r.billedQty;
      t.billedAmount += r.billedAmount;
      t.reimbQty += r.reimbQty;
      t.reimbAmount += r.reimbAmount;
      t.reshippedQty += r.reshippedQty;
      t.inWarehouseQty += r.inWarehouseQty;
    }
    return t;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">📦</span>
        <p className="text-sm font-semibold text-foreground">No receipts yet</p>
        <p className="text-xs">Use Receive button in Orders tab</p>
      </div>
    );
  }

  const numHead = (label: string, total: React.ReactNode) => (
    <TableHead className="text-right text-[11px]">
      {label}
      <div className="text-[10px] font-normal text-muted-foreground">{total}</div>
    </TableHead>
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-[11px]">Removal ID</TableHead>
              <TableHead className="text-[11px]">Request Date</TableHead>
              <TableHead className="text-right text-[11px]">Lines</TableHead>
              {numHead("Exp.", totals.expectedQty.toLocaleString())}
              {numHead("Rcvd Qty", totals.receivedQty.toLocaleString())}
              {numHead("Fee", `$${totals.removalFee.toFixed(2)}`)}
              {numHead("Billed Qty", totals.billedQty.toLocaleString())}
              {numHead("Billed Amt", `$${totals.billedAmount.toFixed(2)}`)}
              {numHead("Reimb. Qty", totals.reimbQty.toLocaleString())}
              {numHead("Reimb. $", `$${totals.reimbAmount.toFixed(2)}`)}
              {numHead("Reshipped", totals.reshippedQty.toLocaleString())}
              {numHead("In WH Qty", totals.inWarehouseQty.toLocaleString())}
              <TableHead className="text-center text-[11px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.map((r) => (
              <TableRow key={r.orderId} className="text-xs hover:bg-slate-50/60">
                <TableCell className="font-mono font-semibold">{r.orderId}</TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {r.requestDate || "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {r.lines}
                </TableCell>
                <TableCell className="text-right font-mono">{r.expectedQty}</TableCell>
                <TableCell className="text-right font-mono font-bold text-blue-700">
                  {r.receivedQty}
                </TableCell>
                <TableCell className="text-right font-mono text-amber-700">
                  {r.removalFee > 0 ? `$${r.removalFee.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.billedQty || "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-amber-700">
                  {r.billedAmount > 0 ? `$${r.billedAmount.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-emerald-700">
                  {r.reimbQty || "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-emerald-700">
                  {r.reimbAmount > 0 ? `$${r.reimbAmount.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.reshippedQty || "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono font-semibold",
                    r.inWarehouseQty > 0 ? "text-slate-800" : "text-muted-foreground",
                  )}
                >
                  {r.inWarehouseQty}
                </TableCell>
                <TableCell className="text-center">
                  <ReceiptStatusBadge
                    status={r.status}
                    overCredit={r.overCredit}
                    received={r.receivedQty}
                    reimbQty={r.reimbQty}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        totalRows={rows.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />
    </div>
  );
}

function ReceiptStatusBadge({
  status,
  overCredit,
  received,
  reimbQty,
}: {
  status: ReceiptAggregate["status"];
  overCredit: number;
  received: number;
  reimbQty: number;
}) {
  const map: Record<
    ReceiptAggregate["status"],
    { label: string; cls: string; title: string }
  > = {
    IN_STOCK: {
      label: "📦 In Stock",
      cls: "border-blue-200 bg-blue-50 text-blue-700",
      title: `${received - reimbQty} u left after reimbursements`,
    },
    CLEARED: {
      label: "✓ Cleared",
      cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
      title: "All received units reshipped / reimbursed / disposed — nothing in stock",
    },
    AWAITING: {
      label: "⏳ Awaiting",
      cls: "border-slate-200 bg-slate-50 text-slate-600",
      title: "No units received yet",
    },
    DISCREPANCY: {
      label: "⚠ Discrepancy",
      cls: "border-red-200 bg-red-50 text-red-700",
      title: `Over-credited by ${overCredit} u (reshipped + reimbursed exceed received)`,
    },
  };
  const m = map[status];
  return (
    <span
      className={cn(
        "inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        m.cls,
      )}
      title={m.title}
    >
      {m.label}
    </span>
  );
}
