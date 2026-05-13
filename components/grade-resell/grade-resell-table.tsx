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
import { GradeResellStatus } from "@prisma/client";
import { CheckCircle2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import type { GradeResellItemRow } from "@/actions/grade-resell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateCell, formatMoney } from "@/lib/cases-ui";
import { cn } from "@/lib/utils";

type GradeResellTableProps = {
  data: GradeResellItemRow[];
  onEdit: (row: GradeResellItemRow) => void;
  onMarkSold: (row: GradeResellItemRow) => void;
  onDelete: (row: GradeResellItemRow) => void;
};

function statusBadgeClass(status: GradeResellStatus): string {
  switch (status) {
    case "PENDING":
      return "border-slate-200 bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
    case "GRADED":
      return "border-blue-200 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200";
    case "LISTED":
      return "border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
    case "SOLD":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100";
    case "RETURNED":
      return "border-orange-200 bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100";
    case "DISPOSED":
      return "border-red-200 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function computeMargin(
  resell: string | null,
  sold: string | null,
): { profit: number; pct: number } | null {
  if (!resell || !sold) return null;
  const r = Number.parseFloat(resell);
  const s = Number.parseFloat(sold);
  if (!Number.isFinite(r) || !Number.isFinite(s) || r === 0) return null;
  const profit = s - r;
  const pct = (profit / r) * 100;
  return { profit, pct };
}

export function GradeResellTable({
  data,
  onEdit,
  onMarkSold,
  onDelete,
}: GradeResellTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");

  const columns = React.useMemo<ColumnDef<GradeResellItemRow>[]>(
    () => [
      {
        accessorKey: "msku",
        header: "MSKU",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.msku}</span>
        ),
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => {
          const t = row.original.title;
          if (!t) return <span className="text-muted-foreground">—</span>;
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block max-w-[260px] truncate text-muted-foreground">
                    {t}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-md whitespace-pre-wrap text-xs">
                  {t}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
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
        accessorKey: "asin",
        header: "ASIN",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.asin ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "quantity",
        header: () => <span className="block text-right">Qty</span>,
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {row.original.quantity.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "grade",
        header: "Grade",
        cell: ({ row }) => (
          <span className="text-xs">{row.original.grade ?? "—"}</span>
        ),
      },
      {
        accessorKey: "resellPrice",
        header: () => <span className="block text-right">Resell $</span>,
        cell: ({ row }) => {
          const r = row.original.resellPrice;
          const s = row.original.soldPrice;
          const margin = computeMargin(r, s);
          if (!margin) {
            return (
              <span className="block text-right font-mono tabular-nums">
                {formatMoney(r)}
              </span>
            );
          }
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block cursor-help text-right font-mono tabular-nums underline decoration-dotted">
                    {formatMoney(r)}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  <div>Resell: {formatMoney(r)}</div>
                  <div>Sold: {formatMoney(s)}</div>
                  <div
                    className={cn(
                      margin.profit >= 0 ? "text-emerald-300" : "text-red-300",
                    )}
                  >
                    Margin: {margin.profit.toFixed(2)} ({margin.pct.toFixed(1)}
                    %)
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        accessorKey: "soldPrice",
        header: () => <span className="block text-right">Sold $</span>,
        cell: ({ row }) => {
          const r = row.original.resellPrice;
          const s = row.original.soldPrice;
          const margin = computeMargin(r, s);
          if (!margin) {
            return (
              <span className="block text-right font-mono tabular-nums">
                {formatMoney(s)}
              </span>
            );
          }
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block cursor-help text-right font-mono tabular-nums underline decoration-dotted">
                    {formatMoney(s)}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  <div>Resell: {formatMoney(r)}</div>
                  <div>Sold: {formatMoney(s)}</div>
                  <div
                    className={cn(
                      margin.profit >= 0 ? "text-emerald-300" : "text-red-300",
                    )}
                  >
                    Margin: {margin.profit.toFixed(2)} ({margin.pct.toFixed(1)}
                    %)
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn(
              "font-normal normal-case",
              statusBadgeClass(row.original.status),
            )}
          >
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "channel",
        header: "Channel",
        cell: ({ row }) => (
          <span className="text-xs">{row.original.channel ?? "—"}</span>
        ),
      },
      {
        accessorKey: "gradedDate",
        accessorFn: (row) => {
          if (!row.gradedDate) return 0;
          const t = new Date(row.gradedDate as unknown as string).getTime();
          return Number.isNaN(t) ? 0 : t;
        },
        header: "Graded",
        cell: ({ row }) => formatDateCell(row.original.gradedDate),
      },
      {
        accessorKey: "gradedBy",
        header: "Graded by",
        cell: ({ row }) => (
          <span className="text-xs">{row.original.gradedBy ?? "—"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const isSold = item.status === "SOLD";
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label="Actions"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => onEdit(item)}>
                    <Pencil className="mr-2 size-3.5" /> Edit
                  </DropdownMenuItem>
                  {!isSold ? (
                    <DropdownMenuItem onSelect={() => onMarkSold(item)}>
                      <CheckCircle2 className="mr-2 size-3.5" /> Mark as sold
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:bg-red-50 focus:text-red-700"
                    onSelect={() => onDelete(item)}
                  >
                    <Trash2 className="mr-2 size-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [onDelete, onEdit, onMarkSold],
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
                  <TableHead
                    key={header.id}
                    className="h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 border-r border-slate-200 last:border-r-0 px-3"
                  >
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
                  No grade &amp; resell items match the current filters.
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
