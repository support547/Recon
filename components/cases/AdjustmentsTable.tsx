"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";

import type { ManualAdjustmentRow } from "@/actions/cases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDateCell,
  formatEnumLabel,
  reconTypeBadgeClass,
} from "@/lib/cases-ui";
import { cn } from "@/lib/utils";

type AdjustmentsTableProps = {
  data: ManualAdjustmentRow[];
  onEdit: (row: ManualAdjustmentRow) => void;
  onDelete: (row: ManualAdjustmentRow) => void;
};

export function AdjustmentsTable({
  data,
  onEdit,
  onDelete,
}: AdjustmentsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");

  const columns = React.useMemo<ColumnDef<ManualAdjustmentRow>[]>(
    () => [
      {
        accessorKey: "msku",
        header: "MSKU",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.msku ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "fnsku",
        header: "FNSKU",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.fnsku ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "reconType",
        header: "Recon",
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn(
              "font-normal normal-case",
              reconTypeBadgeClass(row.original.reconType),
            )}
          >
            {formatEnumLabel(row.original.reconType)}
          </Badge>
        ),
      },
      {
        accessorKey: "adjType",
        header: "Adj type",
        cell: ({ row }) => (
          <Badge variant="secondary" className="font-normal normal-case">
            {formatEnumLabel(row.original.adjType)}
          </Badge>
        ),
      },
      {
        accessorKey: "qtyBefore",
        header: () => <span className="block text-right">Qty before</span>,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {row.original.qtyBefore.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "qtyAdjusted",
        header: () => <span className="block text-right">Adjusted</span>,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {row.original.qtyAdjusted.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "qtyAfter",
        header: () => <span className="block text-right">Qty after</span>,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {row.original.qtyAfter.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "reason",
        header: "Reason",
        cell: ({ row }) => (
          <span className="max-w-[200px] truncate text-muted-foreground">
            {row.original.reason ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "adjDate",
        accessorFn: (row) => {
          if (!row.adjDate) return 0;
          const t = new Date(row.adjDate as unknown as string).getTime();
          return Number.isNaN(t) ? 0 : t;
        },
        header: "Adj date",
        cell: ({ row }) => formatDateCell(row.original.adjDate),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              aria-label="Edit adjustment"
              onClick={() => onEdit(row.original)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon-xs"
              aria-label="Delete adjustment"
              onClick={() => onDelete(row.original)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [onDelete, onEdit],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
    initialState: { pagination: { pageSize: 15 } },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Filter loaded rows…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />
        <p className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} row(s) after filter ·{" "}
          {data.length} loaded
        </p>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className={cn(
                          "-mx-2 inline-flex items-center rounded px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide hover:bg-muted/80",
                          header.column.getCanSort()
                            ? "cursor-pointer select-none"
                            : "",
                        )}
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
                  No adjustments match the current filters.
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
        </Table>
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
  );
}
