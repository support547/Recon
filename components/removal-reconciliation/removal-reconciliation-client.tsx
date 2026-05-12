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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { OrdersTable } from "@/components/removal-reconciliation/orders-tab/orders-table";
import { ReceiptsTable } from "@/components/removal-reconciliation/receipts-tab/receipts-table";
import { ReceiveModal } from "@/components/removal-reconciliation/modals/receive-modal";
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

const ALL_DISP = "__all__";

export function RemovalReconciliationClient({
  initialPayload,
}: {
  initialPayload: RemovalReconciliationPayload;
}) {
  const [tab, setTab] = React.useState<"orders" | "receipts">("orders");
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
  const [receivePreCase, setReceivePreCase] = React.useState(false);
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

  function exportCsv() {
    const headers = [
      "Request Date", "Order ID", "MSKU", "FNSKU", "Type", "Order Status", "Disposition",
      "Carriers", "Tracking", "Requested", "Expected", "Shipped",
      "Received", "Sellable", "Unsellable", "Missing", "Wrong Item",
      "Reimb Qty", "Reimb $", "Fee", "Status", "Case Count", "Case IDs",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
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
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "removal_recon.csv";
    a.click();
    URL.revokeObjectURL(url);
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
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Removal Reconciliation</h1>
            <p className="text-xs text-muted-foreground">InvenSync › Removal Recon</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              ⬇ Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => void reload()}>
              ↻ Refresh
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "orders" | "receipts")} className="gap-4">
          <TabsList className="h-9 w-full justify-start sm:w-auto">
            <TabsTrigger value="orders" className="text-xs">📋 Removal Orders</TabsTrigger>
            <TabsTrigger value="receipts" className="text-xs">📦 Receipts Log</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="text-[11px] font-semibold text-muted-foreground">Order Status</span>
              <Select value={orderStatus} onValueChange={setOrderStatus}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
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
              <span className="text-[11px] font-semibold text-muted-foreground">Disposition</span>
              <Select value={disposition} onValueChange={setDisposition}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DISP}>All</SelectItem>
                  {dispositionOptions.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] font-semibold text-muted-foreground">Type</span>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue placeholder="All" />
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
                className="h-8 w-[140px] text-xs"
                placeholder="From"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-[140px] text-xs"
                placeholder="To"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 MSKU / FNSKU / Order ID"
                className="h-8 max-w-[240px] text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="ml-auto text-xs"
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
              <span className="text-[11px] font-bold text-amber-700">
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
            ) : (
              <OrdersTable
                rows={filteredRows}
                onReceive={(r) => {
                  setReceiveRow(r);
                  setReceivePreCase(false);
                  setReceiveOpen(true);
                }}
                onCase={(r) => {
                  setReceiveRow(r);
                  setReceivePreCase(true);
                  setReceiveOpen(true);
                }}
                onReimb={(r) =>
                  openReimbOrder(r, setReimbTarget, setReimbOpen)
                }
                onUnlock={(r) => void onUnlockOrder(r)}
                colTotalFilter={colTotalFilter}
                onToggleColTotal={(k) =>
                  setColTotalFilter((cur) => (cur === k ? null : k))
                }
              />
            )}
          </TabsContent>

          <TabsContent value="receipts" className="mt-0 space-y-4">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ReceiptsTable
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
          preselectCase={receivePreCase}
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

function openReimbOrder(
  r: RemovalReconRow,
  setTarget: (t: ReimbModalTarget) => void,
  setOpen: (v: boolean) => void,
) {
  setTarget({
    kind: "order",
    orderId: r.orderId,
    fnsku: r.fnsku,
    msku: r.msku,
    missingQty: r.missingQty || Math.max(0, r.expectedShipped - r.receivedQty),
  });
  setOpen(true);
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
