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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ShipmentAggregateRow } from "@/lib/shipment-reconciliation-logic";

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
        accessorFn: (r) => r.ship_date,
        cell: ({ row }) => {
          const r0 = row.original;
          const days = r0.days_open !== "—" ? Number(r0.days_open) : null;
          const dayColor =
            days != null && days > 60
              ? "text-red-600"
              : days != null && days > 30
                ? "text-amber-500"
                : "text-slate-500";
          return (
            <div className="font-mono text-[11px] text-muted-foreground">
              <div>{r0.ship_date}</div>
              {r0.last_updated && r0.last_updated !== "—" ? (
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
        accessorKey: "shipment_status",
        header: "Status",
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
        header: () => <div className="text-right">SKUs</div>,
        cell: ({ getValue }) => (
          <div className="text-right font-mono text-xs">{Number(getValue())}</div>
        ),
      },
      {
        accessorKey: "shipped",
        header: () => <div className="text-right">Shipped</div>,
        cell: ({ getValue }) => (
          <div className="text-right font-mono text-xs">{Number(getValue())}</div>
        ),
      },
      {
        id: "received",
        accessorFn: (r) => r.received,
        header: () => <div className="text-right">Received</div>,
        cell: ({ row }) => {
          const r0 = row.original;
          return (
            <div className="text-right font-mono text-xs">
              {r0.received}
              <ReceiveProgress shipped={r0.shipped} received={r0.received} />
            </div>
          );
        },
      },
      {
        accessorKey: "shortage",
        header: () => <div className="text-right">Shortage</div>,
        cell: ({ row }) =>
          row.original.shortage > 0 ? (
            <div className="text-right font-mono text-xs font-bold text-red-600">
              -{row.original.shortage}
            </div>
          ) : (
            <div className="text-right font-mono text-xs font-bold text-emerald-600">
              0
            </div>
          ),
      },
      {
        accessorKey: "reimb",
        header: () => <div className="text-right">Reimbursed</div>,
        cell: ({ row }) =>
          row.original.reimb > 0 ? (
            <div className="text-right font-mono text-xs font-bold text-blue-600">
              +{row.original.reimb}
            </div>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "pending",
        header: () => <div className="text-right">Pending</div>,
        cell: ({ row }) =>
          row.original.pending > 0 ? (
            <div className="text-right font-mono text-xs font-bold text-red-600">
              -{row.original.pending}
            </div>
          ) : (
            <div className="text-right font-mono text-xs font-bold text-emerald-600">
              0
            </div>
          ),
      },
      {
        id: "summary",
        header: "Summary",
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
    initialState: { pagination: { pageSize: 50 } },
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

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-slate-50 hover:bg-slate-50">
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                  >
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => onDrillDown(row.original.shipment_id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="align-middle text-xs">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{rows.length.toLocaleString()} shipments</span>
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
