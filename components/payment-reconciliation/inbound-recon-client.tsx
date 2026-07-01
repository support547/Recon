"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { PermissionModule } from "@prisma/client";
import { Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteInboundShipment,
  getInboundShipments,
  resyncAllInboundSnapshots,
  type InboundShipmentFilters,
  type InboundShipmentRow,
} from "@/actions/inbound-recon";
import { InboundReconFormModal } from "@/components/payment-reconciliation/inbound-recon-form-modal";
import { useCanDelete } from "@/components/auth/permissions-context";
import { RefreshKpiButton } from "@/components/dashboard/refresh-kpi-button";
import { HeaderActions } from "@/components/layout/header-actions";
import { useTrackPending } from "@/components/nav/nav-progress-store";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { SummaryCard } from "@/components/shared/SummaryCard";
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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateCell } from "@/lib/cases-ui";
import { cn } from "@/lib/utils";

function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const INBOUND_TABLE_COLUMNS: { id: string; label: string }[] = [
  { id: "shipmentId", label: "Shipment ID" },
  { id: "createdDate", label: "Created" },
  { id: "lastUpdated", label: "Last Upd" },
  { id: "unitsLocated", label: "Located" },
  { id: "shipmentStatus", label: "Ship Status" },
  { id: "shipTo", label: "Ship To" },
  { id: "manualProcFee", label: "Mnl Proc" },
  { id: "placementFee", label: "Placement" },
  { id: "partneredCarrier", label: "Carrier" },
  { id: "settlementIds", label: "Sett. IDs" },
  { id: "settledTransport", label: "Act. Transport" },
  { id: "settledPlacement", label: "Act. Placement" },
  { id: "reconStatus", label: "Recon Status" },
  { id: "actions", label: "Action" },
];

type ReconStatusKey =
  | "no_data"
  | "pending"
  | "no_estimate"
  | "matched"
  | "overcharged";

const RECON_STATUS_ORDER: ReconStatusKey[] = [
  "overcharged",
  "no_estimate",
  "matched",
  "pending",
  "no_data",
];

const RECON_STATUS_LABEL: Record<ReconStatusKey, string> = {
  no_data: "No Data",
  pending: "Pending",
  no_estimate: "No Estimate",
  matched: "Matched",
  overcharged: "Overcharged",
};

function reconStatusBadgeClasses(s: ReconStatusKey): string {
  switch (s) {
    case "no_data":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "pending":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "no_estimate":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "matched":
      return "bg-green-100 text-green-800 border-green-200";
    case "overcharged":
      return "bg-red-100 text-red-800 border-red-200";
  }
}

function parseAmt(v: string | null): number {
  if (v == null) return 0;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function computeReconStatus(row: InboundShipmentRow): ReconStatusKey {
  const totalEstimated =
    Math.abs(parseAmt(row.manualProcFee)) +
    Math.abs(parseAmt(row.placementFee)) +
    Math.abs(parseAmt(row.partneredCarrier));
  const totalActual =
    Math.abs(parseAmt(row.settledPlacement)) +
    Math.abs(parseAmt(row.settledTransport));

  const hasActuals = totalActual > 0;
  const hasEstimates = totalEstimated > 0;

  if (hasActuals && hasEstimates && totalActual > totalEstimated)
    return "overcharged";
  if (hasActuals && !hasEstimates) return "no_estimate";
  if (hasActuals && hasEstimates && totalActual <= totalEstimated)
    return "matched";
  if (!hasActuals && row.shipmentStatus) return "pending";
  return "no_data";
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function statusBadgeClasses(status: string | null): string {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "closed") return "bg-green-100 text-green-800 border-green-200";
  if (s === "working") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (s === "receiving") return "bg-blue-100 text-blue-800 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function sumDecimal(values: (string | null)[]): number {
  let acc = 0;
  for (const v of values) {
    if (v == null) continue;
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) acc += n;
  }
  return acc;
}

type InboundReconClientProps = {
  initialItems: InboundShipmentRow[];
};

export function InboundReconClient({ initialItems }: InboundReconClientProps) {
  const router = useRouter();

  const [filters, setFilters] = React.useState<InboundShipmentFilters>({});
  const debouncedFilters = useDebouncedValue(filters, 320);

  const [items, setItems] = React.useState(initialItems);
  const [loading, setLoading] = React.useState(false);
  useTrackPending(loading);

  React.useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInboundShipments(debouncedFilters).then((rows) => {
      if (!cancelled) {
        setItems(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedFilters]);

  const refresh = React.useCallback(() => {
    router.refresh();
  }, [router]);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalMode, setModalMode] = React.useState<"create" | "edit">("create");
  const [selected, setSelected] = React.useState<InboundShipmentRow | null>(
    null,
  );

  const canDelete = useCanDelete(PermissionModule.RECONCILIATION);

  function openCreate() {
    setSelected(null);
    setModalMode("create");
    setModalOpen(true);
  }

  function openEdit(row: InboundShipmentRow) {
    setSelected(row);
    setModalMode("edit");
    setModalOpen(true);
  }

  async function handleDelete(row: InboundShipmentRow) {
    if (
      !window.confirm(
        `Soft-delete inbound shipment «${row.shipmentId}»?`,
      )
    ) {
      return;
    }
    const res = await deleteInboundShipment(row.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Shipment removed.");
    refresh();
    setItems((prev) => prev.filter((r) => r.id !== row.id));
  }

  function onSaved() {
    refresh();
    getInboundShipments(debouncedFilters).then(setItems);
  }

  const [reconStatusFilter, setReconStatusFilter] =
    React.useState<ReconStatusKey | null>(null);

  const itemsWithRecon = React.useMemo(
    () =>
      items.map((r) => ({ row: r, recon: computeReconStatus(r) })),
    [items],
  );

  const reconCounts = React.useMemo(() => {
    const c: Record<ReconStatusKey, number> = {
      no_data: 0,
      pending: 0,
      no_estimate: 0,
      matched: 0,
      overcharged: 0,
    };
    for (const it of itemsWithRecon) c[it.recon] += 1;
    return c;
  }, [itemsWithRecon]);

  const filteredItems = React.useMemo(
    () =>
      reconStatusFilter == null
        ? items
        : itemsWithRecon
            .filter((it) => it.recon === reconStatusFilter)
            .map((it) => it.row),
    [items, itemsWithRecon, reconStatusFilter],
  );

  const totalItems = items.length;
  const totalProc = sumDecimal(items.map((r) => r.manualProcFee));
  const totalPlacement = sumDecimal(items.map((r) => r.placementFee));
  const totalCarrier = sumDecimal(items.map((r) => r.partneredCarrier));
  const totalActTransport = sumDecimal(items.map((r) => r.settledTransport));
  const totalActPlacement = sumDecimal(items.map((r) => r.settledPlacement));

  const columns = React.useMemo<ColumnDef<InboundShipmentRow>[]>(
    () => [
      {
        accessorKey: "shipmentId",
        header: "Shipment ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.shipmentId}</span>
        ),
      },
      {
        accessorKey: "createdDate",
        header: "Created",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs">
            {row.original.createdDate
              ? formatDateCell(row.original.createdDate)
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "lastUpdated",
        header: "Last Upd",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs">
            {row.original.lastUpdated
              ? formatDateCell(row.original.lastUpdated)
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "unitsLocated",
        header: () => <span className="block text-right">Located</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {row.original.unitsLocated != null
              ? row.original.unitsLocated.toLocaleString()
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "shipmentStatus",
        header: "Ship Status",
        enableSorting: false,
        cell: ({ row }) => {
          const s = row.original.shipmentStatus;
          if (!s) return <span className="text-muted-foreground">—</span>;
          return (
            <Badge variant="outline" className={statusBadgeClasses(s)}>
              {s}
            </Badge>
          );
        },
      },
      {
        accessorKey: "shipTo",
        header: "Ship To",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.shipTo ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "manualProcFee",
        header: () => <span className="block text-right">Mnl Proc</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {fmtUsd(Number.parseFloat(row.original.manualProcFee ?? ""))}
          </span>
        ),
      },
      {
        accessorKey: "placementFee",
        header: () => <span className="block text-right">Placement</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {fmtUsd(Number.parseFloat(row.original.placementFee ?? ""))}
          </span>
        ),
      },
      {
        accessorKey: "partneredCarrier",
        header: () => <span className="block text-right">Carrier</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {fmtUsd(Number.parseFloat(row.original.partneredCarrier ?? ""))}
          </span>
        ),
      },
      {
        accessorKey: "settlementIds",
        header: "Sett. IDs",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.settlementIds ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "settledTransport",
        header: () => <span className="block text-right">Act. Transport</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {row.original.settledTransport == null
              ? "—"
              : fmtUsd(Number.parseFloat(row.original.settledTransport))}
          </span>
        ),
      },
      {
        accessorKey: "settledPlacement",
        header: () => <span className="block text-right">Act. Placement</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {row.original.settledPlacement == null
              ? "—"
              : fmtUsd(Number.parseFloat(row.original.settledPlacement))}
          </span>
        ),
      },
      {
        id: "reconStatus",
        header: "Recon Status",
        enableSorting: false,
        cell: ({ row }) => {
          const key = computeReconStatus(row.original);
          return (
            <Badge variant="outline" className={reconStatusBadgeClasses(key)}>
              {RECON_STATUS_LABEL[key]}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex justify-center gap-1">
              <button
                type="button"
                className="flex size-[26px] items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400 hover:bg-blue-100"
                title="Edit"
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(item);
                }}
              >
                <Pencil className="size-3.5" aria-hidden />
              </button>
              {canDelete ? (
                <button
                  type="button"
                  className="flex size-[26px] items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:border-red-400 hover:bg-red-100"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item);
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canDelete],
  );

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const table = useReactTable({
    data: filteredItems,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
    initialState: { pagination: { pageSize: 15 } },
  });

  return (
    <>
      <HeaderActions>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
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
              {INBOUND_TABLE_COLUMNS.map((c) => (
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
          <ExportCsvButton
            table="inbound_shipments"
            query={
              new URLSearchParams({
                ...(filters.search?.trim()
                  ? { search: filters.search.trim() }
                  : {}),
              }).toString() || undefined
            }
          />
          <RefreshKpiButton
            refreshAction={resyncAllInboundSnapshots}
            label="Refresh"
            successMessage={(n) => `Synced ${n ?? 0} shipments.`}
          />
        </div>
      </HeaderActions>
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="border-b border-border pb-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Inbound Recon
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Manual entry of FBA inbound shipment fees. Phase 1: data capture only
          — actuals, variance, and reconciliation logic will follow in a later
          phase.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label="Shipments"
          value={totalItems.toLocaleString()}
          accent="blue"
        />
        <SummaryCard
          label="Total Mnl Proc"
          value={fmtUsd(totalProc)}
          accent="teal"
        />
        <SummaryCard
          label="Total Placement"
          value={fmtUsd(totalPlacement)}
          accent="orange"
        />
        <SummaryCard
          label="Total Carrier"
          value={fmtUsd(totalCarrier)}
          accent="green"
        />
        <SummaryCard
          label="Total Act. Transport"
          value={fmtUsd(totalActTransport)}
          accent="orange"
        />
        <SummaryCard
          label="Total Act. Placement"
          value={fmtUsd(totalActPlacement)}
          accent="teal"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid min-w-[200px] flex-[2] gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Search Shipment ID
          </span>
          <Input
            placeholder="Server-side search…"
            value={filters.search ?? ""}
            onChange={(e) =>
              setFilters((f) => ({ ...f, search: e.target.value }))
            }
          />
        </div>

        <Button type="button" className="gap-1.5" onClick={openCreate}>
          <Plus className="size-4" />
          Add Shipment
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading shipments…</p>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Recon Status:
          </span>
          <button
            type="button"
            onClick={() => setReconStatusFilter(null)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[11px] transition",
              reconStatusFilter == null
                ? "border-slate-400 bg-slate-100 text-slate-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            <span className="font-semibold">All</span>
            <span className="text-slate-500">{items.length}</span>
          </button>
          {RECON_STATUS_ORDER.map((key) => {
            const on = reconStatusFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setReconStatusFilter(on ? null : key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[11px] transition",
                  on
                    ? reconStatusBadgeClasses(key)
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                <span className="font-semibold">
                  {RECON_STATUS_LABEL[key]}
                </span>
                <span className={on ? "" : "text-slate-500"}>
                  {reconCounts[key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Filter loaded rows…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground">
            {table.getFilteredRowModel().rows.length} row(s) after filter ·{" "}
            {items.length} loaded
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 border-r border-slate-200 last:border-r-0 px-3"
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="-mx-2 inline-flex cursor-pointer select-none items-center rounded px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide hover:bg-muted/80"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getIsSorted() === "asc"
                            ? " ↑"
                            : header.column.getIsSorted() === "desc"
                              ? " ↓"
                              : null}
                        </button>
                      ) : (
                        <span className="-mx-2 inline-block px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No inbound shipments match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount() || 1}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <InboundReconFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={modalMode}
        item={selected}
        onSaved={onSaved}
      />
    </main>
    </>
  );
}
