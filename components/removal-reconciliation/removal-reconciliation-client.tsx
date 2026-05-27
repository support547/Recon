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
  carriers: string;
  trackingNumbers: string;
};

const ALL_DISP = "__all__";

export function RemovalReconciliationClient({
  initialPayload,
}: {
  initialPayload: RemovalReconciliationPayload;
}) {
  const [tab, setTab] = React.useState<"orders" | "receipts">("orders");
  const [ordersView, setOrdersView] = React.useState<"sku" | "order">("sku");
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
          carriers: "",
          trackingNumbers: "",
        };
        carrierSets[oid] = new Set();
        trackingSets[oid] = new Set();
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
      for (const c of (r.carriers || "").split(/[,;|]/).map((s) => s.trim()).filter(Boolean)) {
        carrierSets[oid].add(c);
      }
      for (const t of (r.trackingNumbers || "").split(/[,;|]/).map((s) => s.trim()).filter(Boolean)) {
        trackingSets[oid].add(t);
      }
    }
    for (const oid of Object.keys(g)) {
      g[oid].carriers = Array.from(carrierSets[oid]).join(", ");
      g[oid].trackingNumbers = Array.from(trackingSets[oid]).join(", ");
    }
    return Object.values(g);
  }, [filteredRows]);

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
          {tab === "orders" && ordersView === "sku" ? (
            <ColumnsMenu
              columns={ORDERS_TABLE_COLUMNS}
              visibility={ordersVis}
              onChange={setOrdersVis}
            />
          ) : tab === "receipts" ? (
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
                placeholder="🔍 MSKU / FNSKU / Order ID"
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
                secondary={Number(stats.reimbursedAmount.toFixed(0))}
                secLabel="$"
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
              <Skeleton className="h-64 w-full" />
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
              <Skeleton className="h-64 w-full" />
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
  secondary,
  secLabel,
  active,
  onClick,
}: {
  label: string;
  border: "blue" | "green" | "red" | "amber" | "slate" | "teal";
  primary: number;
  secondary: number;
  secLabel: string;
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
          <span className="mt-0.5 text-[8px] text-muted-foreground">SKUs</span>
        </div>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex flex-col items-center">
          <span className={cn("font-mono text-sm font-bold leading-none", c)}>
            {secondary.toLocaleString()}
          </span>
          <span className="mt-0.5 text-[8px] text-muted-foreground">{secLabel}</span>
        </div>
      </div>
    </button>
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
                  <TableCell className="font-mono font-semibold text-blue-700 underline-offset-2 hover:underline">
                    {r.orderId}
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
                  <TableCell className="text-right font-mono">
                    {r.caseCount || "—"}
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
