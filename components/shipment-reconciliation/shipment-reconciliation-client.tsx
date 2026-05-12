"use client";

import * as React from "react";
import type { CaseTrackerRow, ManualAdjustmentRow } from "@/actions/cases";
import {
  deleteShipmentCaAdjustment,
  deleteShipmentCaCase,
  getShipmentReconciliationData,
  listShipmentCaAdjustments,
  listShipmentCaCases,
  type ShipmentReconciliationPayload,
} from "@/actions/shipment-reconciliation";
import { CaStandaloneAdjustmentDialog, CaStandaloneCaseDialog } from "@/components/shipment-reconciliation/ca-standalone-dialogs";
import { ReconActionDialog } from "@/components/shipment-reconciliation/recon-action-dialog";
import { ReconDetailSheet } from "@/components/shipment-reconciliation/recon-detail-sheet";
import { ShipmentAggTable } from "@/components/shipment-reconciliation/shipment-agg-table";
import {
  SKU_TABLE_COLUMNS,
  SkuReconTable,
} from "@/components/shipment-reconciliation/sku-recon-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  adjustmentLegacyAdjType,
  displayCaseStatusLabel,
  formatIsoDate,
  reconTypeToLegacy,
} from "@/lib/shipment-reconciliation-display";
import type {
  ActionCacheEntry,
  ShipmentReconRow,
} from "@/lib/shipment-reconciliation-logic";
import {
  aggregateShipments,
  summaryStats,
  trimCl,
} from "@/lib/shipment-reconciliation-logic";
import { cn } from "@/lib/utils";
import { Pencil, Settings2, Trash2 } from "lucide-react";
import type { VisibilityState } from "@tanstack/react-table";
import { toast } from "sonner";

const CA_ALL = "__all__";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

function caseStatusBadgeClass(s: string) {
  const map: Record<string, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    raised: "border-blue-200 bg-blue-50 text-blue-700",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    partial: "border-violet-200 bg-violet-50 text-violet-800",
    rejected: "border-red-200 bg-red-50 text-red-700",
    closed: "border-slate-200 bg-slate-100 text-slate-600",
  };
  return map[s] ?? "border-slate-200 bg-slate-100 text-slate-600";
}

function reconBadgeClass(t: string) {
  const map: Record<string, string> = {
    shipment: "border-blue-200 bg-blue-50 text-blue-700",
    removal: "border-orange-200 bg-orange-50 text-orange-800",
    return: "border-violet-200 bg-violet-50 text-violet-800",
    fc_transfer: "border-slate-200 bg-slate-100 text-slate-700",
    fba_balance: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return map[t] ?? "border-slate-200 bg-slate-100 text-slate-600";
}

function adjTypeBadgeClass(t: string) {
  const map: Record<string, string> = {
    found: "border-emerald-200 bg-emerald-50 text-emerald-700",
    lost: "border-red-200 bg-red-50 text-red-700",
    damaged: "border-red-200 bg-red-50 text-red-700",
    correction: "border-violet-200 bg-violet-50 text-violet-800",
    count_adjustment: "border-blue-200 bg-blue-50 text-blue-700",
    donated: "border-slate-200 bg-slate-100 text-slate-600",
  };
  return map[t] ?? "border-slate-200 bg-slate-100 text-slate-600";
}

type Props = {
  initialPayload: ShipmentReconciliationPayload;
  initialCases: CaseTrackerRow[];
  initialAdjustments: ManualAdjustmentRow[];
};

export function ShipmentReconciliationClient({
  initialPayload,
  initialCases,
  initialAdjustments,
}: Props) {
  const [pageTab, setPageTab] = React.useState<"recon" | "ca">("recon");
  const [caSub, setCaSub] = React.useState<"cases" | "adj">("cases");
  const [reconView, setReconView] = React.useState<"sku" | "shipment">("sku");

  const [shipmentStatus, setShipmentStatus] = React.useState("all");
  const [shipmentId, setShipmentId] = React.useState("all");
  const [reconStatus, setReconStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [colTotalFilter, setColTotalFilter] =
    React.useState<import("@/components/shipment-reconciliation/sku-recon-table").ColTotalKey | null>(null);

  const [rows, setRows] = React.useState(initialPayload.rows);
  const [overlay, setOverlay] = React.useState(initialPayload.overlay);
  const [shipmentOptions, setShipmentOptions] = React.useState(
    initialPayload.shipmentOptions,
  );
  const [reconLoading, setReconLoading] = React.useState(false);

  const [cases, setCases] = React.useState(initialCases);
  const [adjs, setAdjs] = React.useState(initialAdjustments);
  const [cfType, setCfType] = React.useState(CA_ALL);
  const [cfStatus, setCfStatus] = React.useState(CA_ALL);
  const [cfSearch, setCfSearch] = React.useState("");
  const debouncedCfSearch = useDebounced(cfSearch, 280);
  const [afType, setAfType] = React.useState(CA_ALL);
  const [afAdj, setAfAdj] = React.useState(CA_ALL);
  const [afSearch, setAfSearch] = React.useState("");
  const debouncedAfSearch = useDebounced(afSearch, 280);
  const [caLoading, setCaLoading] = React.useState(false);

  const [drawerRow, setDrawerRow] = React.useState<ShipmentReconRow | null>(
    null,
  );
  const [actionOpen, setActionOpen] = React.useState(false);
  const [actionRow, setActionRow] = React.useState<ShipmentReconRow | null>(
    null,
  );
  const [actionPre, setActionPre] = React.useState<"case" | "adj" | null>(null);

  const [caseDlgOpen, setCaseDlgOpen] = React.useState(false);
  const [caseEditing, setCaseEditing] = React.useState<CaseTrackerRow | null>(
    null,
  );
  const [adjDlgOpen, setAdjDlgOpen] = React.useState(false);
  const [adjEditing, setAdjEditing] = React.useState<ManualAdjustmentRow | null>(
    null,
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#cases") setPageTab("ca");
  }, []);

  const reloadRecon = React.useCallback(async () => {
    setReconLoading(true);
    try {
      const data = await getShipmentReconciliationData({
        shipmentStatus,
        shipmentId,
      });
      setRows(data.rows);
      setOverlay(data.overlay);
      setShipmentOptions(data.shipmentOptions);
    } finally {
      setReconLoading(false);
    }
  }, [shipmentStatus, shipmentId]);

  const skipInitialReconFetch = React.useRef(true);
  React.useEffect(() => {
    if (skipInitialReconFetch.current) {
      skipInitialReconFetch.current = false;
      return;
    }
    void reloadRecon();
  }, [reloadRecon]);

  React.useEffect(() => {
    let cancelled = false;
    setCaLoading(true);
    listShipmentCaCases({
      reconLegacy: cfType !== CA_ALL ? cfType : undefined,
      statusLegacy: cfStatus !== CA_ALL ? cfStatus : undefined,
      search: debouncedCfSearch || undefined,
    }).then((r) => {
      if (!cancelled) {
        setCases(r);
        setCaLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cfType, cfStatus, debouncedCfSearch]);

  React.useEffect(() => {
    let cancelled = false;
    setCaLoading(true);
    listShipmentCaAdjustments({
      reconLegacy: afType !== CA_ALL ? afType : undefined,
      adjLegacy: afAdj !== CA_ALL ? afAdj : undefined,
      search: debouncedAfSearch || undefined,
    }).then((r) => {
      if (!cancelled) {
        setAdjs(r);
        setCaLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [afType, afAdj, debouncedAfSearch]);

  const filteredRows = React.useMemo(() => {
    const fQ = debouncedSearch.toLowerCase();
    return rows.filter((r) => {
      if (reconStatus !== "all" && r.status !== reconStatus) return false;
      if (
        fQ &&
        !r.msku.toLowerCase().includes(fQ) &&
        !r.asin.toLowerCase().includes(fQ) &&
        !(r.fnsku || "").toLowerCase().includes(fQ) &&
        !r.title.toLowerCase().includes(fQ)
      )
        return false;
      if (colTotalFilter) {
        const fk = (r.fnsku || "").trim().replace(/['"]/g, "");
        const ca = overlay[fk];
        switch (colTotalFilter) {
          case "shipped_qty":
            if (r.shipped_qty <= 0) return false;
            break;
          case "received":
            if (r.received_qty <= 0) return false;
            break;
          case "shortage":
            if (r.shortage <= 0) return false;
            break;
          case "reimb":
            if (r.reimb_qty <= 0) return false;
            break;
          case "pending":
            if (r.pending <= 0) return false;
            break;
          case "case_raised":
            if (!ca || (ca.case_raised || 0) <= 0) return false;
            break;
          case "adjusted":
            if (!ca || (ca.adj_qty || 0) === 0) return false;
            break;
        }
      }
      return true;
    });
  }, [rows, reconStatus, debouncedSearch, colTotalFilter, overlay]);

  const stats = React.useMemo(() => summaryStats(rows, overlay), [rows, overlay]);
  const aggregates = React.useMemo(
    () => aggregateShipments(filteredRows),
    [filteredRows],
  );

  async function refreshAll() {
    await reloadRecon();
    const [c, a] = await Promise.all([
      listShipmentCaCases({
        reconLegacy: cfType !== CA_ALL ? cfType : undefined,
        statusLegacy: cfStatus !== CA_ALL ? cfStatus : undefined,
        search: debouncedCfSearch || undefined,
      }),
      listShipmentCaAdjustments({
        reconLegacy: afType !== CA_ALL ? afType : undefined,
        adjLegacy: afAdj !== CA_ALL ? afAdj : undefined,
        search: debouncedAfSearch || undefined,
      }),
    ]);
    setCases(c);
    setAdjs(a);
    toast.success("↻ Refreshed!");
  }

  function exportReconCsv() {
    const h = [
      "Shipment ID",
      "Ship Date",
      "Last Updated",
      "Days Open",
      "MSKU",
      "Title",
      "ASIN",
      "FNSKU",
      "Shipped",
      "Received",
      "Shortage",
      "Reimbursed",
      "Pending",
      "Case Raised",
      "Adjusted",
      "Status",
    ];
    const body = filteredRows.map((r) => {
      const fk = trimCl(r.fnsku);
      const ca: ActionCacheEntry =
        overlay[fk] ?? {
          case_raised: 0,
          case_approved: 0,
          case_amount: 0,
          adj_qty: 0,
          case_status: null,
          case_count: 0,
          case_ids: [],
        };
      return [
        r.shipment_id,
        r.ship_date,
        r.last_updated || "",
        r.days_open === "—" ? "" : String(r.days_open),
        r.msku,
        `"${String(r.title).replace(/"/g, "'")}"`,
        r.asin,
        r.fnsku,
        r.shipped_qty,
        r.received_qty,
        r.shortage,
        r.reimb_qty,
        r.pending,
        ca.case_raised || "",
        ca.adj_qty || "",
        r.status,
      ];
    });
    const csv = [h, ...body].map((line) => line.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shipment_recon.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported!");
  }

  function exportCaCsv() {
    if (caSub === "cases") {
      const h = [
        "MSKU",
        "Title",
        "Recon Type",
        "Shipment/Ref",
        "FNSKU",
        "Issue Date",
        "Units Claimed",
        "Units Approved",
        "$ Claimed",
        "$ Approved",
        "Case ID",
        "Case Reason",
        "Status",
        "Raised Date",
        "Resolved Date",
        "Notes",
      ];
      const data = cases.map((c) => [
        c.msku ?? "",
        `"${String(c.title ?? "").replace(/"/g, "'")}"`,
        reconTypeToLegacy(c.reconType),
        c.shipmentId ?? c.orderId ?? "",
        c.fnsku ?? "",
        formatIsoDate(c.issueDate),
        c.unitsClaimed,
        c.unitsApproved,
        c.amountClaimed ?? "",
        c.amountApproved ?? "",
        c.referenceId ?? "",
        c.caseReason ?? "",
        displayCaseStatusLabel(c),
        formatIsoDate(c.raisedDate),
        formatIsoDate(c.resolvedDate),
        `"${String(c.notes ?? "").replace(/"/g, "'")}"`,
      ]);
      const csv = [h, ...data].map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "case_tracker.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("✅ Case Tracker exported!");
    } else {
      const h = [
        "MSKU",
        "Title",
        "Recon Type",
        "Adj Type",
        "Shipment/Ref",
        "FNSKU",
        "Adj Date",
        "Qty Before",
        "Adjustment",
        "Qty After",
        "Reason",
        "Verified By",
        "Source Doc",
        "Notes",
      ];
      const data = adjs.map((x) => [
        x.msku ?? "",
        `"${String(x.title ?? "").replace(/"/g, "'")}"`,
        reconTypeToLegacy(x.reconType),
        adjustmentLegacyAdjType(x),
        x.shipmentId ?? x.orderId ?? "",
        x.fnsku ?? "",
        formatIsoDate(x.adjDate),
        x.qtyBefore,
        x.qtyAdjusted,
        x.qtyAfter,
        `"${String(x.reason ?? "").replace(/"/g, "'")}"`,
        x.verifiedBy ?? "",
        x.sourceDoc ?? "",
        `"${String(x.notes ?? "").replace(/"/g, "'")}"`,
      ]);
      const csv = [h, ...data].map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "manual_adjustments.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("✅ Manual Adjustments exported!");
    }
  }

  function filterCaseNeeded() {
    setReconStatus("case_needed");
  }

  function drillDown(sid: string) {
    setShipmentId(sid);
    setReconView("sku");
  }

  function shipmentIcon(st: string) {
    if (st === "Closed") return "🔒";
    if (st === "Receiving") return "📥";
    if (st === "Working") return "🔧";
    return "📤";
  }

  async function onDeleteCase(id: string) {
    if (!confirm("Delete this case?")) return;
    const res = await deleteShipmentCaCase(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setCases((prev) => prev.filter((c) => c.id !== id));
    toast.success("🗑 Case deleted");
    await reloadRecon();
  }

  async function onDeleteAdj(id: string) {
    if (!confirm("Delete this adjustment?")) return;
    const res = await deleteShipmentCaAdjustment(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setAdjs((prev) => prev.filter((a) => a.id !== id));
    toast.success("🗑 Deleted");
    await reloadRecon();
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            {pageTab === "recon"
              ? "Shipment Reconciliation"
              : "Cases & Adjustments"}
          </h1>
          <p className="text-xs text-muted-foreground">
            InvenSync ›{" "}
            {pageTab === "recon" ? "Shipment Recon" : "Cases & Adjustments"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pageTab === "recon" ? (
            <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition",
                  reconView === "sku"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                onClick={() => setReconView("sku")}
              >
                By SKU
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition",
                  reconView === "shipment"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                onClick={() => setReconView("shipment")}
              >
                By Shipment
              </button>
            </div>
          ) : null}
          {pageTab === "recon" && reconView === "sku" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  title="Show/hide columns"
                >
                  <Settings2 className="size-3.5" aria-hidden />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SKU_TABLE_COLUMNS.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={columnVisibility[c.id] !== false}
                    onCheckedChange={(v) =>
                      setColumnVisibility((prev) => ({
                        ...prev,
                        [c.id]: Boolean(v),
                      }))
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    {c.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {pageTab === "recon" ? (
            <Button variant="outline" size="sm" onClick={exportReconCsv}>
              ⬇ Export CSV
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={exportCaCsv}>
              ⬇ Export CSV
            </Button>
          )}
          <Button size="sm" onClick={() => void refreshAll()}>
            ↻ Refresh
          </Button>
        </div>
      </div>

      <Tabs
        value={pageTab}
        onValueChange={(v) => setPageTab(v as "recon" | "ca")}
        className="gap-4"
      >
        <TabsList className="h-9 w-full justify-start sm:w-auto">
          <TabsTrigger value="recon" className="text-xs">
            Shipment Recon
          </TabsTrigger>
          <TabsTrigger value="ca" className="text-xs">
            Cases & Adjustments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recon" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="text-[11px] font-semibold text-muted-foreground">
              Shipment Status
            </span>
            <Select value={shipmentStatus} onValueChange={setShipmentStatus}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
                <SelectItem value="Receiving">Receiving</SelectItem>
                <SelectItem value="Working">Working</SelectItem>
                <SelectItem value="Shipped">Shipped</SelectItem>
                <SelectItem value="Unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <div className="hidden h-6 w-px bg-slate-200 sm:block" />
            <span className="text-[11px] font-semibold text-muted-foreground">
              Shipment ID
            </span>
            <Select value={shipmentId} onValueChange={setShipmentId}>
              <SelectTrigger className="h-8 min-w-[200px] max-w-[280px] text-xs">
                <SelectValue placeholder="All Shipments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Shipments</SelectItem>
                {shipmentOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {shipmentIcon(o.status)} {o.id}
                    {o.dateKey ? ` · ${o.dateKey}` : ""} ({o.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="hidden h-6 w-px bg-slate-200 sm:block" />
            <span className="text-[11px] font-semibold text-muted-foreground">
              Recon Status
            </span>
            <Select value={reconStatus} onValueChange={setReconStatus}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="matched">✓ Matched</SelectItem>
                <SelectItem value="case_needed">🔴 Case Needed</SelectItem>
                <SelectItem value="partial">◑ Partial</SelectItem>
                <SelectItem value="shortage">⚠ Shortage</SelectItem>
                <SelectItem value="excess">↑ Excess</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-8 max-w-[220px] text-xs"
              placeholder="🔍 MSKU / ASIN / FNSKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto text-xs"
              onClick={filterCaseNeeded}
            >
              🔴 Cases Needed
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard
              label="Total SKUs"
              border="blue"
              primary={stats.totalSkus.toLocaleString()}
              subLabel="SKUs"
              secondary={stats.totalQty.toLocaleString()}
              secondarySub="Units"
              loading={reconLoading}
            />
            <SummaryCard
              label="Matched"
              border="green"
              primary={stats.matchedSkus.toLocaleString()}
              subLabel="SKUs"
              secondary={stats.matchedQty.toLocaleString()}
              secondarySub="Units"
              loading={reconLoading}
            />
            <SummaryCard
              label="Shortage"
              border="red"
              primary={stats.shortageSkus.toLocaleString()}
              subLabel="SKUs"
              secondary={stats.shortQty.toLocaleString()}
              secondarySub="Units"
              loading={reconLoading}
            />
            <SummaryCard
              label="Cases Raised"
              border="amber"
              primary={stats.caseRaisedSkus.toLocaleString()}
              subLabel="SKUs"
              secondary={stats.caseRaisedQty.toLocaleString()}
              secondarySub="Claimed"
              loading={reconLoading}
            />
            <SummaryCard
              label="Adjustments"
              border="slate"
              primary={stats.adjSkus.toLocaleString()}
              subLabel="SKUs"
              secondary={stats.adjQty.toLocaleString()}
              secondarySub="Units"
              loading={reconLoading}
            />
            <SummaryCard
              label="Reimbursement"
              border="teal"
              primary={stats.reimbQty.toLocaleString()}
              subLabel="Lost_Inb"
              secondary={stats.caseApprovedQty.toLocaleString()}
              secondarySub="Approved"
              loading={reconLoading}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="p-2 sm:p-4">
              {reconLoading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : reconView === "sku" ? (
                <SkuReconTable
                  rows={filteredRows}
                  overlay={overlay}
                  onOpenDrawer={(r) => setDrawerRow(r)}
                  onOpenAction={(r, mode) => {
                    setActionRow(r);
                    setActionPre(mode);
                    setActionOpen(true);
                  }}
                  columnVisibility={columnVisibility}
                  onColumnVisibilityChange={setColumnVisibility}
                  colTotalFilter={colTotalFilter}
                  onToggleColTotal={(k) =>
                    setColTotalFilter((cur) => (cur === k ? null : k))
                  }
                />
              ) : (
                <ShipmentAggTable
                  rows={aggregates}
                  onDrillDown={drillDown}
                />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ca" className="mt-0 space-y-4">
          <div className="flex w-full flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 sm:w-fit">
            <button
              type="button"
              className={cn(
                "rounded-md px-4 py-1.5 text-xs font-semibold transition",
                caSub === "cases"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => setCaSub("cases")}
            >
              📋 Case Tracker
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-4 py-1.5 text-xs font-semibold transition",
                caSub === "adj"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => setCaSub("adj")}
            >
              🔧 Manual Adjustments
            </button>
          </div>

          {caSub === "cases" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Recon Type
                </span>
                <Select value={cfType} onValueChange={setCfType}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CA_ALL}>All Types</SelectItem>
                    <SelectItem value="shipment">Shipment</SelectItem>
                    <SelectItem value="removal">Removal</SelectItem>
                    <SelectItem value="return">Return</SelectItem>
                    <SelectItem value="fc_transfer">FC Transfer</SelectItem>
                    <SelectItem value="fba_balance">FBA Balance</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Status
                </span>
                <Select value={cfStatus} onValueChange={setCfStatus}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CA_ALL}>All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="raised">Raised</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 max-w-[220px] text-xs"
                  placeholder="🔍 MSKU / Case ID / Shipment..."
                  value={cfSearch}
                  onChange={(e) => setCfSearch(e.target.value)}
                />
                <Button
                  size="sm"
                  className="ml-auto text-xs"
                  onClick={() => {
                    setCaseEditing(null);
                    setCaseDlgOpen(true);
                  }}
                >
                  + Add Case
                </Button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="text-[10px] font-bold uppercase">
                        MSKU / Title
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Recon Type
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Shipment / Ref
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        FNSKU
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Issue Found
                      </TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase">
                        Discrepancy
                      </TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase">
                        Units Claimed
                      </TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase">
                        Units Approved
                      </TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase">
                        $ Claimed
                      </TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase">
                        $ Approved
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Case ID
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Case Reason
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Status
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Raised Date
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Resolved Date
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Notes
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {caLoading ? (
                      <TableRow>
                        <TableCell colSpan={17} className="py-12 text-center">
                          <Skeleton className="mx-auto h-8 w-48" />
                        </TableCell>
                      </TableRow>
                    ) : !cases.length ? (
                      <TableRow>
                        <TableCell colSpan={17} className="py-16 text-center">
                          <div className="text-muted-foreground">
                            <div className="mb-2 text-3xl">📋</div>
                            <div className="text-sm font-semibold text-foreground">
                              No cases yet
                            </div>
                            <div className="mt-1 text-xs">
                              Raise a case from the Reconciliation tab or add
                              manually
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      cases.map((c) => {
                        const st = displayCaseStatusLabel(c);
                        const disp = reconTypeToLegacy(c.reconType);
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="max-w-[180px] align-top">
                              <div className="font-mono text-[11px] font-medium">
                                {c.msku}
                              </div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {c.title ?? "—"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full font-mono text-[10px]",
                                  reconBadgeClass(disp),
                                )}
                              >
                                {disp}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-[11px]">
                              {c.shipmentId ?? c.orderId ?? c.referenceId ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-[11px]">
                              {c.fnsku ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                              {formatIsoDate(c.issueDate)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-bold text-red-600">
                              {c.unitsClaimed || 0}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {c.unitsClaimed || 0}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-emerald-600">
                              {c.unitsApproved ?? "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {c.amountClaimed
                                ? `$${Number.parseFloat(c.amountClaimed).toFixed(2)}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-emerald-600">
                              {c.amountApproved
                                ? `$${Number.parseFloat(c.amountApproved).toFixed(2)}`
                                : "—"}
                            </TableCell>
                            <TableCell className="font-mono text-[11px]">
                              {c.referenceId ?? "—"}
                            </TableCell>
                            <TableCell className="max-w-[140px] truncate text-[11px]">
                              {c.caseReason ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full font-mono text-[10px] capitalize",
                                  caseStatusBadgeClass(st),
                                )}
                              >
                                {st}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                              {formatIsoDate(c.raisedDate)}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                              {formatIsoDate(c.resolvedDate)}
                            </TableCell>
                            <TableCell
                              className="max-w-[120px] truncate text-[11px]"
                              title={c.notes ?? ""}
                            >
                              {c.notes ?? "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  title="Edit"
                                  className="flex size-[26px] items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50"
                                  onClick={() => {
                                    setCaseEditing(c);
                                    setCaseDlgOpen(true);
                                  }}
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Delete"
                                  className="flex size-[26px] items-center justify-center rounded-md border border-slate-200 bg-white text-red-600 hover:bg-red-50"
                                  onClick={() => void onDeleteCase(c.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Recon Type
                </span>
                <Select value={afType} onValueChange={setAfType}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CA_ALL}>All Types</SelectItem>
                    <SelectItem value="shipment">Shipment</SelectItem>
                    <SelectItem value="removal">Removal</SelectItem>
                    <SelectItem value="return">Return</SelectItem>
                    <SelectItem value="fc_transfer">FC Transfer</SelectItem>
                    <SelectItem value="fba_balance">FBA Balance</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Adj Type
                </span>
                <Select value={afAdj} onValueChange={setAfAdj}>
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CA_ALL}>All</SelectItem>
                    <SelectItem value="found">Found</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="correction">Correction</SelectItem>
                    <SelectItem value="count_adjustment">Count Adj</SelectItem>
                    <SelectItem value="donated">Donated</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 max-w-[200px] text-xs"
                  placeholder="🔍 MSKU / Reference..."
                  value={afSearch}
                  onChange={(e) => setAfSearch(e.target.value)}
                />
                <Button
                  size="sm"
                  className="ml-auto text-xs"
                  onClick={() => {
                    setAdjEditing(null);
                    setAdjDlgOpen(true);
                  }}
                >
                  + Add Adjustment
                </Button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="text-[10px] font-bold uppercase">
                        MSKU / Title
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Recon Type
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Adj Type
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Shipment / Ref
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        FNSKU
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Adj Date
                      </TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase">
                        Qty Before
                      </TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase">
                        Adjustment
                      </TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase">
                        Qty After
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Reason / Root Cause
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Verified By
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Source Doc
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Notes
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {caLoading ? (
                      <TableRow>
                        <TableCell colSpan={14} className="py-12 text-center">
                          <Skeleton className="mx-auto h-8 w-48" />
                        </TableCell>
                      </TableRow>
                    ) : !adjs.length ? (
                      <TableRow>
                        <TableCell colSpan={14} className="py-16 text-center">
                          <div className="text-muted-foreground">
                            <div className="mb-2 text-3xl">🔧</div>
                            <div className="text-sm font-semibold text-foreground">
                              No adjustments yet
                            </div>
                            <div className="mt-1 text-xs">
                              Adjustments from reconciliation will appear here
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      adjs.map((a) => {
                        const rt = reconTypeToLegacy(a.reconType);
                        const at = adjustmentLegacyAdjType(a);
                        const qa = a.qtyAdjusted || 0;
                        return (
                          <TableRow key={a.id}>
                            <TableCell className="max-w-[180px] align-top">
                              <div className="font-mono text-[11px] font-medium">
                                {a.msku}
                              </div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {a.title ?? "—"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full font-mono text-[10px]",
                                  reconBadgeClass(rt),
                                )}
                              >
                                {rt}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full font-mono text-[10px]",
                                  adjTypeBadgeClass(at),
                                )}
                              >
                                {at}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-[11px]">
                              {a.shipmentId ?? a.orderId ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-[11px]">
                              {a.fnsku ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                              {formatIsoDate(a.adjDate)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                              {a.qtyBefore ?? "—"}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right font-mono text-xs font-bold",
                                qa >= 0 ? "text-blue-600" : "text-red-600",
                              )}
                            >
                              {qa >= 0 ? "+" : ""}
                              {qa}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-bold">
                              {a.qtyAfter ?? "—"}
                            </TableCell>
                            <TableCell
                              className="max-w-[160px] truncate text-[11px]"
                              title={a.reason ?? ""}
                            >
                              {a.reason ?? "—"}
                            </TableCell>
                            <TableCell className="text-[11px]">
                              {a.verifiedBy ?? "—"}
                            </TableCell>
                            <TableCell className="text-[11px]">
                              {a.sourceDoc ?? "—"}
                            </TableCell>
                            <TableCell
                              className="max-w-[120px] truncate text-[11px]"
                              title={a.notes ?? ""}
                            >
                              {a.notes ?? "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  title="Edit"
                                  className="flex size-[26px] items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50"
                                  onClick={() => {
                                    setAdjEditing(a);
                                    setAdjDlgOpen(true);
                                  }}
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Delete"
                                  className="flex size-[26px] items-center justify-center rounded-md border border-slate-200 bg-white text-red-600 hover:bg-red-50"
                                  onClick={() => void onDeleteAdj(a.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ReconDetailSheet
        row={drawerRow}
        overlay={overlay}
        open={!!drawerRow}
        onOpenChange={(o) => {
          if (!o) setDrawerRow(null);
        }}
        onOpenAction={(r, mode) => {
          setDrawerRow(null);
          setActionRow(r);
          setActionPre(mode);
          setActionOpen(true);
        }}
      />

      <ReconActionDialog
        row={actionRow}
        open={actionOpen}
        onOpenChange={(o) => {
          setActionOpen(o);
          if (!o) {
            setActionRow(null);
            setActionPre(null);
          }
        }}
        preselect={actionPre}
        onSaved={async () => {
          await reloadRecon();
          const [c, a] = await Promise.all([
            listShipmentCaCases({
              reconLegacy: cfType !== CA_ALL ? cfType : undefined,
              statusLegacy: cfStatus !== CA_ALL ? cfStatus : undefined,
              search: debouncedCfSearch || undefined,
            }),
            listShipmentCaAdjustments({
              reconLegacy: afType !== CA_ALL ? afType : undefined,
              adjLegacy: afAdj !== CA_ALL ? afAdj : undefined,
              search: debouncedAfSearch || undefined,
            }),
          ]);
          setCases(c);
          setAdjs(a);
        }}
      />

      <CaStandaloneCaseDialog
        open={caseDlgOpen}
        onOpenChange={setCaseDlgOpen}
        editing={caseEditing}
        onSaved={async () => {
          const c = await listShipmentCaCases({
            reconLegacy: cfType !== CA_ALL ? cfType : undefined,
            statusLegacy: cfStatus !== CA_ALL ? cfStatus : undefined,
            search: debouncedCfSearch || undefined,
          });
          setCases(c);
          await reloadRecon();
        }}
      />

      <CaStandaloneAdjustmentDialog
        open={adjDlgOpen}
        onOpenChange={setAdjDlgOpen}
        editing={adjEditing}
        onSaved={async () => {
          const a = await listShipmentCaAdjustments({
            reconLegacy: afType !== CA_ALL ? afType : undefined,
            adjLegacy: afAdj !== CA_ALL ? afAdj : undefined,
            search: debouncedAfSearch || undefined,
          });
          setAdjs(a);
          await reloadRecon();
        }}
      />
      </div>
    </TooltipProvider>
  );
}

function SummaryCard({
  label,
  border,
  primary,
  subLabel,
  secondary,
  secondarySub,
  loading,
  className,
}: {
  label: string;
  border: "blue" | "green" | "red" | "amber" | "slate" | "teal";
  primary: string;
  subLabel: string;
  secondary: string;
  secondarySub: string;
  loading?: boolean;
  className?: string;
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
    <div
      className={cn(
        "flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm",
        "border-t-[3px]",
        b,
        className,
      )}
    >
      <div className="mb-1 text-center text-[8.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {loading ? (
        <Skeleton className="mx-auto h-12 w-24" />
      ) : (
        <div className="flex items-center justify-center gap-2">
          <div className="flex flex-col items-center">
            <span className={cn("font-mono text-lg font-bold leading-none", c)}>
              {primary}
            </span>
            <span className="mt-0.5 text-center text-[8px] text-muted-foreground">
              {subLabel}
            </span>
          </div>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex flex-col items-center">
            <span className={cn("font-mono text-sm font-bold leading-none", c)}>
              {secondary}
            </span>
            <span className="mt-0.5 text-center text-[8px] text-muted-foreground">
              {secondarySub}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
