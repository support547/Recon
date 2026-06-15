"use client";

import * as React from "react";
import {
  getMissingShipments,
  getShipmentReconciliationData,
  type ShipmentReconciliationPayload,
} from "@/actions/shipment-reconciliation";
import { HeaderActions } from "@/components/layout/header-actions";
import { ReconActionDialog } from "@/components/shipment-reconciliation/recon-action-dialog";
import { ReconDetailSheet } from "@/components/shipment-reconciliation/recon-detail-sheet";
import { ShipmentAggTable } from "@/components/shipment-reconciliation/shipment-agg-table";
import {
  SKU_TABLE_COLUMNS,
  SkuReconTable,
  wrongLabelKey,
  type WrongLabelOverlay,
} from "@/components/shipment-reconciliation/sku-recon-table";
import {
  WrongLabelDialog,
  type WrongLabelDialogContext,
} from "@/components/shipment-reconciliation/wrong-label-dialog";
import { NewShipmentsDialog } from "@/components/shipment-reconciliation/new-shipments-dialog";
import { listWrongLabelByShipment } from "@/actions/adjustments";
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
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  ActionCacheEntry,
  ShipmentReconRow,
} from "@/lib/shipment-reconciliation-logic";
import {
  aggregateShipments,
  summaryStats,
  tableRowDerived,
  trimCl,
} from "@/lib/shipment-reconciliation-logic";
import { cn } from "@/lib/utils";
import { Settings2 } from "lucide-react";
import type { VisibilityState } from "@tanstack/react-table";
import { toast } from "sonner";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

type Props = {
  initialPayload: ShipmentReconciliationPayload;
  initialWrongLabelOverlay?: WrongLabelOverlay;
};

export function ShipmentReconciliationClient({
  initialPayload,
  initialWrongLabelOverlay,
}: Props) {
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

  const [drawerRow, setDrawerRow] = React.useState<ShipmentReconRow | null>(
    null,
  );
  const [actionOpen, setActionOpen] = React.useState(false);
  const [actionRow, setActionRow] = React.useState<ShipmentReconRow | null>(
    null,
  );
  const [actionPre, setActionPre] = React.useState<"case" | "adj" | null>(null);

  const [wrongLabelOverlay, setWrongLabelOverlay] = React.useState<WrongLabelOverlay>(
    initialWrongLabelOverlay ?? {},
  );
  const [wrongLabelOpen, setWrongLabelOpen] = React.useState(false);
  const [wrongLabelCtx, setWrongLabelCtx] =
    React.useState<WrongLabelDialogContext | null>(null);
  const [newShipmentsOpen, setNewShipmentsOpen] = React.useState(false);
  const [newShipmentsCount, setNewShipmentsCount] = React.useState<number | null>(
    null,
  );

  // Count for the "New Shipments" button badge — fetched once on mount.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await getMissingShipments();
        if (!cancelled) setNewShipmentsCount(list.length);
      } catch {
        if (!cancelled) setNewShipmentsCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadWrongLabel = React.useCallback(async () => {
    const ids = Array.from(
      new Set(rows.map((r) => r.shipment_id).filter(Boolean)),
    );
    if (ids.length === 0) {
      setWrongLabelOverlay({});
      return;
    }
    const list = await listWrongLabelByShipment(ids);
    const next: WrongLabelOverlay = {};
    for (const s of list) {
      next[wrongLabelKey(s.shipmentId, s.msku)] = {
        totalUnits: s.totalUnits,
        openCount: s.openCount,
      };
    }
    setWrongLabelOverlay(next);
  }, [rows]);

  function openFlagWrongLabel(row: ShipmentReconRow) {
    setWrongLabelCtx({
      shipmentId: row.shipment_id,
      msku: row.msku,
      expectedFnsku: row.fnsku || "",
      asin: row.asin || null,
      title: row.title || null,
      store: null,
    });
    setWrongLabelOpen(true);
  }

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

  const filteredRows = React.useMemo(() => {
    const fQ = debouncedSearch.toLowerCase();
    const EMPTY_CA: ActionCacheEntry = {
      case_raised: 0,
      case_approved: 0,
      case_amount: 0,
      adj_qty: 0,
      case_status: null,
      case_count: 0,
      case_ids: [],
    };
    return rows.filter((r) => {
      if (reconStatus !== "all") {
        const fk = (r.fnsku || "").trim().replace(/['"]/g, "");
        const kind = tableRowDerived(r, overlay[fk] ?? EMPTY_CA).statusBadgeKind;
        if (reconStatus === "case_needed") {
          if (kind !== "take_action") return false;
        } else if (reconStatus === "in_transit") {
          if (kind !== "waiting_closed") return false;
        } else if (reconStatus === "matched") {
          if (kind !== "matched" && kind !== "excess") return false;
        } else if (reconStatus === "excess") {
          if (kind !== "excess") return false;
        } else if (reconStatus === "partial") {
          if (kind !== "partial_reimb") return false;
        } else if (reconStatus === "shortage") {
          if (r.shortage <= 0) return false;
        } else if (r.status !== reconStatus) {
          return false;
        }
      }
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
          case "issues":
            if (r.received_qty - r.shipped_qty <= 0) return false;
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

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
      <HeaderActions>
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
        {reconView === "sku" ? (
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
        <Button variant="outline" size="sm" onClick={exportReconCsv}>
          ⬇ Export CSV
        </Button>
        <Button size="sm" onClick={() => void refreshAll()}>
          ↻ Refresh
        </Button>
      </HeaderActions>

      <div className="mt-0 space-y-4">
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
                <SelectItem value="in_transit">🚚 In Transit</SelectItem>
                <SelectItem value="partial">◑ Partial</SelectItem>
                <SelectItem value="shortage">$([char]0x26A0) Shortage</SelectItem>
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
              variant="outline"
              size="sm"
              className="ml-auto text-xs"
              onClick={() => {
                setShipmentStatus("all");
                setShipmentId("all");
                setReconStatus("all");
                setSearch("");
                setColTotalFilter(null);
              }}
            >
              ✕ Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setNewShipmentsOpen(true)}
            >
              New Shipments
              {newShipmentsCount != null && newShipmentsCount > 0 && (
                <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                  {newShipmentsCount}
                </span>
              )}
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
              active={reconStatus === "all"}
              onClick={() => setReconStatus("all")}
            />
            <SummaryCard
              label="Matched"
              border="green"
              primary={stats.matchedSkus.toLocaleString()}
              subLabel="SKUs"
              secondary={stats.matchedQty.toLocaleString()}
              secondarySub="Units"
              loading={reconLoading}
              active={reconStatus === "matched"}
              onClick={() =>
                setReconStatus((c) => (c === "matched" ? "all" : "matched"))
              }
            />
            <SummaryCard
              label="Shortage"
              border="red"
              primary={stats.shortageSkus.toLocaleString()}
              subLabel="SKUs"
              secondary={stats.shortQty.toLocaleString()}
              secondarySub="Units"
              loading={reconLoading}
              active={reconStatus === "shortage"}
              onClick={() =>
                setReconStatus((c) => (c === "shortage" ? "all" : "shortage"))
              }
            />
            <SummaryCard
              label="Take Action"
              border="red"
              primary={stats.caseNeededSkus.toLocaleString()}
              subLabel="SKUs"
              secondary={stats.caseQty.toLocaleString()}
              secondarySub="Units"
              loading={reconLoading}
              active={reconStatus === "case_needed"}
              onClick={() =>
                setReconStatus((c) =>
                  c === "case_needed" ? "all" : "case_needed",
                )
              }
            />
            <SummaryCard
              label="Resolved (Cases+Adjust)"
              border="slate"
              primary={(stats.caseRaisedSkus + stats.adjSkus).toLocaleString()}
              subLabel="SKUs"
              secondary={(stats.caseRaisedQty + stats.adjQty).toLocaleString()}
              secondarySub="Units"
              loading={reconLoading}
            />
            <SummaryCard
              label="Reimbursement"
              border="teal"
              primary={stats.reimbSkus.toLocaleString()}
              subLabel="SKUs"
              secondary={stats.reimbQty.toLocaleString()}
              secondarySub="Units"
              loading={reconLoading}
              active={reconStatus === "partial"}
              onClick={() =>
                setReconStatus((c) => (c === "partial" ? "all" : "partial"))
              }
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
                  wrongLabelOverlay={wrongLabelOverlay}
                  onOpenDrawer={(r) => setDrawerRow(r)}
                  onOpenAction={(r, mode) => {
                    setActionRow(r);
                    setActionPre(mode);
                    setActionOpen(true);
                  }}
                  onFlagWrongLabel={openFlagWrongLabel}
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
      </div>

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
        }}
      />

      <WrongLabelDialog
        open={wrongLabelOpen}
        onOpenChange={setWrongLabelOpen}
        context={wrongLabelCtx}
        onSaved={async () => {
          await Promise.all([reloadRecon(), reloadWrongLabel()]);
        }}
      />

      <NewShipmentsDialog
        open={newShipmentsOpen}
        onOpenChange={setNewShipmentsOpen}
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
  active,
  onClick,
}: {
  label: string;
  border: "blue" | "green" | "red" | "amber" | "slate" | "teal";
  primary: string;
  subLabel: string;
  secondary: string;
  secondarySub: string;
  loading?: boolean;
  className?: string;
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
      disabled={!onClick}
      className={cn(
        "flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition border-t-[3px]",
        b,
        onClick && "cursor-pointer",
        active ? "ring-2 ring-blue-300" : onClick && "hover:border-slate-300",
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
    </button>
  );
}
