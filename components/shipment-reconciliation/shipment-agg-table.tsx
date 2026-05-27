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
} from "@tanstack/react-table";

import { ReceiveProgress } from "@/components/shipment-reconciliation/recon-cells";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ShipmentAggregateRow } from "@/lib/shipment-reconciliation-logic";
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

export function ShipmentAggTable({
  rows,
  onDrillDown,
}: {
  rows: ShipmentAggregateRow[];
  onDrillDown: (shipmentId: string) => void;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo<ColumnDef<ShipmentAggregateRow>[]>(
    () => [
      {
        id: "sid",
        accessorKey: "shipment_id",
        header: "Shipment ID",
        meta: { align: "left" },
        cell: ({ row }) => {
          const st = row.original.shipment_status;
          return (
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px]">
              <span
                className={`size-1.5 shrink-0 rounded-full ${shipmentDotClass(st)}`}
              />
              {row.original.shipment_id}
            </span>
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
          return (
            <div className="font-mono text-[11px] text-muted-foreground">
              <div>{r0.ship_date}</div>
              {r0.last_updated && r0.last_updated !== "—" ? (
                <div className="mt-0.5 text-[10px]">{r0.last_updated}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "days",
        header: "Days",
        meta: { align: "right" },
        accessorFn: (r) => {
          if (r.days_open !== "—") return Number(r.days_open);
          if (r.ship_date !== "—" && r.last_updated && r.last_updated !== "—") {
            const diff =
              new Date(r.last_updated).getTime() -
              new Date(r.ship_date).getTime();
            if (!Number.isNaN(diff)) return Math.round(diff / 86400000);
          }
          return null;
        },
        cell: ({ row }) => {
          const r0 = row.original;
          let days: number | null =
            r0.days_open !== "—" ? Number(r0.days_open) : null;
          if (
            days == null &&
            r0.ship_date !== "—" &&
            r0.last_updated &&
            r0.last_updated !== "—"
          ) {
            const diff =
              new Date(r0.last_updated).getTime() -
              new Date(r0.ship_date).getTime();
            if (!Number.isNaN(diff)) days = Math.round(diff / 86400000);
          }
          if (days == null) {
            return (
              <div className="text-[11px] text-muted-foreground">—</div>
            );
          }
          const dayColor =
            days > 60
              ? "text-red-600"
              : days > 30
                ? "text-amber-600"
                : "text-slate-700";
          return (
            <div className={`font-mono text-xs font-semibold ${dayColor}`}>
              {days}d
            </div>
          );
        },
      },
      {
        accessorKey: "shipment_status",
        header: "Status",
        meta: { align: "left" },
        cell: ({ row }) => (
          <span
            className={`text-[11px] font-semibold ${shipmentStatusColor(row.original.shipment_status)}`}
          >
            {row.original.shipment_status}
          </span>
        ),
      },
      {
        accessorKey: "skus",
        header: "SKUs",
        meta: { align: "right" },
        cell: ({ getValue }) => (
          <div className="font-mono text-xs">{Number(getValue())}</div>
        ),
      },
      {
        accessorKey: "shipped",
        header: "Shipped",
        meta: { align: "right" },
        cell: ({ getValue }) => (
          <div className="font-mono text-xs">{Number(getValue())}</div>
        ),
      },
      {
        id: "received",
        accessorFn: (r) => r.received,
        header: "Received",
        meta: { align: "right" },
        cell: ({ row }) => {
          const r0 = row.original;
          return (
            <div className="font-mono text-xs">
              {r0.received}
              <ReceiveProgress shipped={r0.shipped} received={r0.received} />
            </div>
          );
        },
      },
      {
        accessorKey: "shortage",
        header: "Shortage",
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.shortage > 0 ? (
            <div className="font-mono text-xs font-bold text-red-600">
              -{row.original.shortage}
            </div>
          ) : (
            <div className="font-mono text-xs font-bold text-emerald-600">
              0
            </div>
          ),
      },
      {
        accessorKey: "reimb",
        header: "Reimbursed",
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.reimb > 0 ? (
            <div className="font-mono text-xs font-bold text-blue-600">
              +{row.original.reimb}
            </div>
          ) : (
            <div className="font-mono text-[11px] text-muted-foreground">—</div>
          ),
      },
      {
        accessorKey: "pending",
        header: "Pending",
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.pending > 0 ? (
            <div className="font-mono text-xs font-bold text-red-600">
              -{row.original.pending}
            </div>
          ) : (
            <div className="font-mono text-xs font-bold text-emerald-600">
              0
            </div>
          ),
      },
      {
        id: "summary",
        header: "Summary",
        meta: { align: "left" },
        cell: ({ row }) => {
          const g = row.original;
          return (
            <div className="flex flex-wrap gap-1">
              {g.matched ? (
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
                  {g.matched} ok
                </span>
              ) : null}
              {g.case_needed ? (
                <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold text-red-700">
                  {g.case_needed} cases
                </span>
              ) : null}
              {g.partial ? (
                <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-800">
                  {g.partial} partial
                </span>
              ) : null}
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  if (!rows.length) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No shipments
      </div>
    );
  }

  const pageCount = table.getPageCount();
  const cur = table.getState().pagination.pageIndex + 1;
  const { pageIndex, pageSize } = table.getState().pagination;

  const totals = React.useMemo(() => {
    let skus = 0;
    let shipped = 0;
    let received = 0;
    let shortage = 0;
    let reimb = 0;
    let pending = 0;
    for (const r of rows) {
      skus += r.skus || 0;
      shipped += r.shipped || 0;
      received += r.received || 0;
      shortage += r.shortage || 0;
      reimb += r.reimb || 0;
      pending += r.pending || 0;
    }
    return { skus, shipped, received, shortage, reimb, pending };
  }, [rows]);

  const totalsByCol: Record<string, number> = {
    skus: totals.skus,
    shipped: totals.shipped,
    received: totals.received,
    shortage: totals.shortage,
    reimb: totals.reimb,
    pending: totals.pending,
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-b-2 border-slate-300 bg-slate-100 hover:bg-slate-100">
                {hg.headers.map((h) => {
                  const total = totalsByCol[h.id];
                  const align =
                    (h.column.columnDef.meta as { align?: string } | undefined)
                      ?.align ?? "left";
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
                        "h-11 whitespace-nowrap px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700",
                        alignText,
                      )}
                    >
                      <div className={cn("flex flex-col gap-0.5", alignItems)}>
                        <span>
                          {h.isPlaceholder
                            ? null
                            : flexRender(h.column.columnDef.header, h.getContext())}
                        </span>
                        {total != null ? (
                          <span className="font-mono text-[11px] font-bold normal-case tracking-normal text-blue-600">
                            {total.toLocaleString()}
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
                className="cursor-pointer border-slate-100 hover:bg-slate-50/60"
                onClick={() => onDrillDown(row.original.shipment_id)}
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
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span>
            Showing {`${pageIndex * pageSize + 1}–${Math.min((pageIndex + 1) * pageSize, rows.length)}`} of {rows.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              className="h-7 rounded border border-slate-200 bg-white px-1.5 text-[11px]"
              value={pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
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
