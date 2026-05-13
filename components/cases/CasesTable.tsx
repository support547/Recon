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

import type { CaseTrackerRow } from "@/actions/cases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  caseStatusBadgeClass,
  formatDateCell,
  formatEnumLabel,
  formatMoney,
  reconTypeBadgeClass,
} from "@/lib/cases-ui";
import { cn } from "@/lib/utils";

type CasesTableProps = {
  data: CaseTrackerRow[];
  onEdit: (row: CaseTrackerRow) => void;
  onDelete: (row: CaseTrackerRow) => void;
};

export function CasesTable({ data, onEdit, onDelete }: CasesTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");

  const columns = React.useMemo<ColumnDef<CaseTrackerRow>[]>(
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
        accessorKey: "caseReason",
        header: "Reason",
        cell: ({ row }) => (
          <span className="max-w-[200px] truncate text-muted-foreground">
            {row.original.caseReason ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "unitsClaimed",
        header: () => <span className="block text-right">U. claimed</span>,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {row.original.unitsClaimed.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "unitsApproved",
        header: () => <span className="block text-right">U. approved</span>,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {row.original.unitsApproved.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "amountClaimed",
        header: () => <span className="block text-right">Amt claimed</span>,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {formatMoney(row.original.amountClaimed)}
          </span>
        ),
      },
      {
        accessorKey: "amountApproved",
        header: () => <span className="block text-right">Amt approved</span>,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {formatMoney(row.original.amountApproved)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn(
              "font-normal normal-case",
              caseStatusBadgeClass(row.original.status),
            )}
          >
            {formatEnumLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        accessorKey: "raisedDate",
        accessorFn: (row) => {
          if (!row.raisedDate) return 0;
          const t = new Date(row.raisedDate as unknown as string).getTime();
          return Number.isNaN(t) ? 0 : t;
        },
        header: "Raised",
        cell: ({ row }) => formatDateCell(row.original.raisedDate),
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
              aria-label="Edit case"
              onClick={() => onEdit(row.original)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon-xs"
              aria-label="Delete case"
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

      <div className="rounded-xl border border-border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="h-11 border-r border-slate-200 px-3 text-slate-700 last:border-r-0">
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
                  No cases match the current filters.
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
  );
}
