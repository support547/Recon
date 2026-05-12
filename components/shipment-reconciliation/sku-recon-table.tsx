"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { Eye, FileText, Wrench } from "lucide-react";

import {
  AdjQtyCell,
  CaseRaisedCell,
  PendingCell,
  ReceivedCell,
  ReconStatusBadge,
  ReimbCell,
  ShortageCell,
} from "@/components/shipment-reconciliation/recon-cells";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ActionCacheEntry,
  ShipmentReconRow,
} from "@/lib/shipment-reconciliation-logic";
import { trimCl } from "@/lib/shipment-reconciliation-logic";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends unknown, TValue> {
    align?: "left" | "right" | "center";
  }
}

function shipmentDotClass(st: string) {
  if (st === "Closed") return "bg-slate-500";
  if (st === "Receiving") return "bg-blue-500";
  return "bg-amber-500";
}

function shipmentStatusColor(st: string) {
  if (st === "Closed") return "text-slate-600";
  if (st === "Receiving") return "text-blue-600";
  return "text-amber-600";
}

export const SKU_TABLE_COLUMNS: { id: string; label: string }[] = [
  { id: "shipment", label: "Shipment ID" },
  { id: "ship_date", label: "Ship Date" },
  { id: "msku", label: "MSKU / Title" },
  { id: "asin", label: "ASIN" },
  { id: "fnsku", label: "FNSKU" },
  { id: "shipped_qty", label: "Shipped" },
  { id: "received", label: "Received" },
  { id: "shortage", label: "Shortage" },
  { id: "reimb", label: "Reimb." },
  { id: "pending", label: "Pending" },
  { id: "status", label: "Status" },
  { id: "case_raised", label: "Case Raised" },
  { id: "adjusted", label: "Adjusted" },
  { id: "action", label: "Action" },
];

export type ColTotalKey =
  | "shipped_qty"
  | "received"
  | "shortage"
  | "reimb"
  | "pending"
  | "case_raised"
  | "adjusted";

export function SkuReconTable({
  rows,
  overlay,
  onOpenDrawer,
  onOpenAction,
  columnVisibility,
  onColumnVisibilityChange,
  colTotalFilter,
  onToggleColTotal,
}: {
  rows: ShipmentReconRow[];
  overlay: Record<string, ActionCacheEntry>;
  onOpenDrawer: (row: ShipmentReconRow) => void;
  onOpenAction?: (row: ShipmentReconRow, mode: "case" | "adj") => void;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (v: VisibilityState) => void;
  colTotalFilter?: ColTotalKey | null;
  onToggleColTotal?: (k: ColTotalKey) => void;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo<ColumnDef<ShipmentReconRow>[]>(
    () => [
      {
        id: "shipment",
        header: "Shipment ID",
        meta: { align: "left" },
        accessorFn: (r) => r.shipment_id,
        cell: ({ row }) => {
          const r0 = row.original;
          const dot = shipmentDotClass(r0.shipment_status);
          const stc = shipmentStatusColor(r0.shipment_status);
          return (
            <div>
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700">
                <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
                {r0.shipment_id}
              </span>
              <div className={`mt-0.5 text-[10px] font-semibold ${stc}`}>
                {r0.shipment_status}
              </div>
            </div>
          );
        },
      },
      {
        id: "ship_date",
        header: "Ship Date",
        meta: { align: "left" },
        accessorFn: (r) => r.ship_date,
        cell: ({ row }) => {
          const r0 = row.original;
          const days =
            r0.days_open !== "—" ? Number(r0.days_open) : null;
          const dayColor =
            days != null && days > 60
              ? "text-red-600"
              : days != null && days > 30
                ? "text-amber-500"
                : "text-slate-500";
          return (
            <div className="font-mono text-[11px] text-muted-foreground">
              <div>{r0.ship_date}</div>
              {r0.last_updated !== "—" ? (
                <div className="mt-0.5 text-[10px]">{r0.last_updated}</div>
              ) : null}
              {days != null ? (
                <div className={`mt-0.5 text-[10px] font-semibold ${dayColor}`}>
                  {days}d
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "msku",
        header: "MSKU / Title",
        meta: { align: "left" },
        accessorFn: (r) => r.msku,
        cell: ({ row }) => (
          <div className="max-w-[180px]">
            <div className="font-mono text-[11px] font-medium">
              {row.original.msku}
            </div>
            <div
              className="mt-0.5 truncate text-[11px] text-muted-foreground"
              title={row.original.title}
            >
              {row.original.title}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "asin",
        header: "ASIN",
        meta: { align: "left" },
        cell: ({ getValue }) => (
          <span className="font-mono text-[11px]">{String(getValue())}</span>
        ),
      },
      {
        accessorKey: "fnsku",
        header: "FNSKU",
        meta: { align: "left" },
        cell: ({ getValue }) => (
          <span className="font-mono text-[11px]">{String(getValue())}</span>
        ),
      },
      {
        accessorKey: "shipped_qty",
        meta: { align: "right" },
        header: () => (
          <span title="Units shipped to FBA" className="cursor-help">
            Shipped
          </span>
        ),
        cell: ({ getValue }) => (
          <div className="text-right font-mono text-xs">{Number(getValue())}</div>
        ),
      },
      {
        id: "received",
        header: "Received",
        meta: { align: "right" },
        accessorFn: (r) => r.received_qty,
        cell: ({ row }) => <ReceivedCell row={row.original} />,
      },
      {
        id: "shortage",
        header: "Shortage",
        meta: { align: "right" },
        accessorFn: (r) => r.shortage,
        cell: ({ row }) => (
          <ShortageCell row={row.original} overlay={overlay} />
        ),
      },
      {
        id: "reimb",
        meta: { align: "right" },
        header: () => (
          <span title="Lost_Inbound reimbursed by Amazon" className="cursor-help">
            Reimb.
          </span>
        ),
        accessorFn: (r) => r.reimb_qty,
        cell: ({ row }) => (
          <ReimbCell row={row.original} overlay={overlay} />
        ),
      },
      {
        id: "pending",
        meta: { align: "right" },
        header: () => (
          <span
            title="Shortage - Reimbursed = still unresolved"
            className="cursor-help"
          >
            Pending
          </span>
        ),
        accessorFn: (r) => r.pending,
        cell: ({ row }) => (
          <div className="text-right">
            <PendingCell row={row.original} overlay={overlay} />
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: { align: "center" },
        cell: ({ row }) => (
          <div className="flex justify-center">
            <ReconStatusBadge row={row.original} overlay={overlay} />
          </div>
        ),
      },
      {
        id: "case_raised",
        meta: { align: "center" },
        header: () => (
          <span title="Units raised in Amazon case" className="cursor-help">
            Case Raised
          </span>
        ),
        cell: ({ row }) => (
          <CaseRaisedCell row={row.original} overlay={overlay} />
        ),
      },
      {
        id: "adjusted",
        meta: { align: "center" },
        header: () => (
          <span title="Units manually adjusted" className="cursor-help">
            Adjusted
          </span>
        ),
        cell: ({ row }) => (
          <AdjQtyCell row={row.original} overlay={overlay} />
        ),
      },
      {
        id: "action",
        header: "Action",
        meta: { align: "center" },
        cell: ({ row }) => (
          <div className="flex justify-center gap-1">
            <button
              type="button"
              className="flex size-[26px] items-center justify-center rounded-md border border-slate-200 bg-white text-[13px] hover:border-blue-300 hover:bg-blue-50"
              title="View detail"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDrawer(row.original);
              }}
            >
              <Eye className="size-3.5" aria-hidden />
            </button>
            {onOpenAction ? (
              <>
                <button
                  type="button"
                  className="flex size-[26px] items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100"
                  title="Raise Case"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAction(row.original, "case");
                  }}
                >
                  <FileText className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className="flex size-[26px] items-center justify-center rounded-md border border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 hover:bg-violet-100"
                  title="Adjust"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAction(row.original, "adj");
                  }}
                >
                  <Wrench className="size-3.5" aria-hidden />
                </button>
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [overlay, onOpenDrawer, onOpenAction],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility: columnVisibility ?? {} },
    onSortingChange: setSorting,
    onColumnVisibilityChange: (updater) => {
      if (!onColumnVisibilityChange) return;
      const next =
        typeof updater === "function"
          ? updater(columnVisibility ?? {})
          : updater;
      onColumnVisibilityChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">✅</span>
        <p className="text-sm font-semibold text-foreground">No items</p>
        <p className="text-xs">Try changing filters</p>
      </div>
    );
  }

  const pageCount = table.getPageCount();
  const cur = table.getState().pagination.pageIndex + 1;
  const { pageIndex, pageSize } = table.getState().pagination;

  const totals = React.useMemo(() => {
    let shipped = 0;
    let received = 0;
    let shortage = 0;
    let reimb = 0;
    let pending = 0;
    let caseRaised = 0;
    let adj = 0;
    for (const r of rows) {
      shipped += r.shipped_qty;
      received += r.received_qty;
      shortage += r.shortage;
      reimb += r.reimb_qty;
      pending += r.pending;
      const fk = trimCl(r.fnsku);
      const ca = overlay[fk];
      if (ca) {
        caseRaised += ca.case_raised || 0;
        adj += Math.abs(ca.adj_qty || 0);
      }
    }
    return { shipped, received, shortage, reimb, pending, caseRaised, adj };
  }, [rows, overlay]);

  const valueFor: Record<ColTotalKey, number> = {
    shipped_qty: totals.shipped,
    received: totals.received,
    shortage: totals.shortage,
    reimb: totals.reimb,
    pending: totals.pending,
    case_raised: totals.caseRaised,
    adjusted: totals.adj,
  };

  function totalFor(colId: string): React.ReactNode {
    if (!(colId in valueFor)) return null;
    const k = colId as ColTotalKey;
    const v = valueFor[k];
    const clickable = typeof onToggleColTotal === "function";
    const active = colTotalFilter === k;
    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={() => onToggleColTotal?.(k)}
        className={cn(
          "rounded px-1 py-0.5 font-mono text-[11px] font-bold text-blue-600 transition",
          clickable ? "cursor-pointer hover:bg-blue-50" : "cursor-default",
          active ? "bg-blue-100 ring-1 ring-blue-400" : undefined,
        )}
      >
        {v.toLocaleString()}
      </button>
    );
  }

  const numericColIds = new Set<string>([
    "shipped_qty",
    "received",
    "shortage",
    "reimb",
    "pending",
    "case_raised",
    "adjusted",
  ]);

  return (
    <div className="space-y-3">
      <div className="max-h-[70vh] overflow-y-auto rounded-md border border-slate-200 bg-white">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-slate-50 hover:bg-slate-50">
                {hg.headers.map((h) => {
                  const isNum = numericColIds.has(h.id);
                  const align =
                    (h.column.columnDef.meta as { align?: string } | undefined)
                      ?.align ?? (isNum ? "right" : "left");
                  const alignText =
                    align === "right"
                      ? "text-right"
                      : align === "center"
                        ? "text-center"
                        : "text-left";
                  const alignItems =
                    align === "right"
                      ? "items-end"
                      : align === "center"
                        ? "items-center"
                        : "items-start";
                  return (
                    <TableHead
                      key={h.id}
                      className={cn(
                        "whitespace-nowrap px-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground",
                        alignText,
                      )}
                    >
                      <div className={cn("flex flex-col gap-0.5", alignItems)}>
                        <span>
                          {h.isPlaceholder
                            ? null
                            : flexRender(
                                h.column.columnDef.header,
                                h.getContext(),
                              )}
                        </span>
                        {isNum ? (
                          <span className="text-[11px] normal-case tracking-normal">
                            {totalFor(h.id)}
                          </span>
                        ) : null}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => onOpenDrawer(row.original)}
              >
                {row.getVisibleCells().map((cell) => {
                  const align =
                    (cell.column.columnDef.meta as
                      | { align?: string }
                      | undefined)?.align ?? "left";
                  const alignText =
                    align === "right"
                      ? "text-right"
                      : align === "center"
                        ? "text-center"
                        : "text-left";
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn("px-3 align-middle text-xs", alignText)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing{" "}
          {`${pageIndex * pageSize + 1}–${Math.min((pageIndex + 1) * pageSize, rows.length)}`}{" "}
          of {rows.length.toLocaleString()}
        </span>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            ← Prev
          </Button>
          {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => i + 1).map(
            (p) => (
              <Button
                key={p}
                type="button"
                variant={cur === p ? "default" : "outline"}
                size="sm"
                className="h-7 min-w-8 px-2 text-[11px]"
                onClick={() => table.setPageIndex(p - 1)}
              >
                {p}
              </Button>
            ),
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}
