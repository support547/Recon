"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

import "./data-table.types";

function cellClassForRole(
  role: "mono" | "amount" | "qty" | "default" | undefined,
): string {
  switch (role) {
    case "mono":
      return "font-[family-name:var(--font-dm-mono)] text-[11px] text-[#0f1117]";
    case "amount":
      return "text-right font-[family-name:var(--font-dm-mono)] text-xs text-[#1a56db]";
    case "qty":
      return "text-right text-xs font-bold text-[#027a48]";
    default:
      return "text-xs text-[#0f1117]";
  }
}

export type DataTableProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  /** Stable row id; required for selection/expansion patterns. */
  getRowId?: (row: TData, index: number) => string;
  /** Controlled sorting (optional). */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  enableSorting?: boolean;
  emptyMessage?: React.ReactNode;
  className?: string;
  tableClassName?: string;
  /** Row attributes / className for stripes, selection, etc. */
  getRowProps?: (row: Row<TData>) => React.HTMLAttributes<HTMLTableRowElement>;
};

export function DataTable<TData>({
  data,
  columns,
  getRowId,
  sorting: sortingControlled,
  onSortingChange,
  enableSorting = true,
  emptyMessage = "No data.",
  className,
  tableClassName,
  getRowProps,
}: DataTableProps<TData>) {
  const [sortingInternal, setSortingInternal] = React.useState<SortingState>(
    [],
  );
  const sorting = sortingControlled ?? sortingInternal;
  const setSorting: OnChangeFn<SortingState> =
    onSortingChange ?? setSortingInternal;

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getRowId,
    enableSorting,
  });

  return (
    <div
      className={cn(
        "relative w-full overflow-auto rounded-lg border border-[#e4e7ec] bg-white",
        className,
      )}
    >
      <table
        className={cn("w-full min-w-max border-collapse", tableClassName)}
      >
        <thead className="sticky top-0 z-10 bg-[#f8fafc]">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b-2 border-[#e4e7ec]">
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const alignRight =
                  header.column.columnDef.meta?.cellRole === "amount" ||
                  header.column.columnDef.meta?.cellRole === "qty";
                return (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cn(
                      "px-[11px] py-[7px] text-left align-bottom text-[9.5px] font-bold uppercase tracking-[0.6px] text-[#9ca3af]",
                      alignRight && "text-right",
                    )}
                    style={{
                      width: header.column.getSize() || undefined,
                    }}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={cn(
                          "inline-flex items-center gap-0.5",
                          alignRight && "ml-auto justify-end",
                          canSort && "cursor-pointer select-none",
                        )}
                        onClick={
                          canSort
                            ? header.column.getToggleSortingHandler()
                            : undefined
                        }
                        onKeyDown={
                          canSort
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  header.column.getToggleSortingHandler()?.(e);
                                }
                              }
                            : undefined
                        }
                        role={canSort ? "button" : undefined}
                        tabIndex={canSort ? 0 : undefined}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {canSort ? (
                          sorted === "desc" ? (
                            <ArrowDown
                              className="size-3 shrink-0 text-[#9ca3af]"
                              aria-hidden
                            />
                          ) : sorted === "asc" ? (
                            <ArrowUp
                              className="size-3 shrink-0 text-[#9ca3af]"
                              aria-hidden
                            />
                          ) : (
                            <ArrowUpDown
                              className="size-3 shrink-0 opacity-50"
                              aria-hidden
                            />
                          )
                        ) : null}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-[11px] py-8 text-center text-xs text-[#4b5563]"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => {
              const extra = getRowProps?.(row) ?? {};
              const { className: rowClass, ...rowRest } = extra;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-[#f1f5f9] transition-colors hover:bg-[#fafbfd]",
                    rowClass,
                  )}
                  {...rowRest}
                >
                  {row.getVisibleCells().map((cell) => {
                    const role = cell.column.columnDef.meta?.cellRole;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-[11px] py-[7px] align-middle",
                          cellClassForRole(role),
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
