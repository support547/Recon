"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { format, isValid, parseISO } from "date-fns";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  dispositionChipVariant,
  statusChipVariant,
  unitStatusChipVariant,
  type ChipVariant,
} from "@/lib/data-explorer-cells";
import {
  type ExplorerCellRole,
  type ExplorerColumnSpec,
} from "@/lib/data-explorer-tab-columns";

const chipClass: Record<ChipVariant, string> = {
  blue: "bg-[#eff4ff] text-[#1a56db]",
  green: "bg-[#ecfdf3] text-[#027a48]",
  red: "bg-[#fff4f2] text-[#b42318]",
  yellow: "bg-[#fffbeb] text-[#92400e]",
  teal: "bg-[#f0fdfa] text-[#0d9488]",
  grey: "bg-[#f1f5f9] text-[#4b5563]",
  purple: "bg-[#f5f3ff] text-[#5b21b6]",
  orange: "bg-[#fff7ed] text-[#c2410c]",
};

function Chip({
  children,
  variant,
  mono,
}: {
  children: React.ReactNode;
  variant: ChipVariant;
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-[20px] px-[7px] py-0.5 text-[10px] font-bold ${chipClass[variant]} ${mono ? "font-[family-name:var(--font-dm-mono)]" : ""}`}
    >
      {children}
    </span>
  );
}

function formatExplorerDate(value: unknown): string {
  if (value == null || value === "") return "—";
  let d: Date;
  if (value instanceof Date) d = value;
  else if (typeof value === "string") {
    d = parseISO(value);
    if (!isValid(d)) d = new Date(value);
  } else return "—";
  if (!isValid(d)) return "—";
  return format(d, "MMM dd, yyyy");
}

function formatInteger(value: unknown): string {
  if (value == null || value === "") return "—";
  const n =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString();
}

function formatMoney(amount: unknown, currencyCode?: unknown): string {
  if (amount == null || amount === "") return "—";
  const n =
    typeof amount === "number"
      ? amount
      : Number.parseFloat(String(amount));
  if (Number.isNaN(n)) return "—";
  const raw =
    typeof currencyCode === "string" ? currencyCode.trim().toUpperCase() : "";
  const code = /^[A-Z]{3}$/.test(raw) ? raw : "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

function defaultCellRole(spec: ExplorerColumnSpec): ExplorerCellRole {
  if (spec.cell) return spec.cell;
  if (spec.kind === "date") return "mono";
  if (spec.kind === "integer") return "text";
  if (spec.kind === "money") return "moneyRight";
  return "text";
}

function csvEscape(s: string) {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvCell(spec: ExplorerColumnSpec, row: Record<string, unknown>) {
  const raw = row[spec.accessorKey];
  switch (spec.kind) {
    case "date":
      if (raw == null || raw === "") return "";
      if (raw instanceof Date) return raw.toISOString();
      return String(raw);
    case "integer":
      if (raw == null || raw === "") return "";
      return String(raw);
    case "money":
      if (raw == null || raw === "") return "";
      return String(raw);
    default:
      return raw == null ? "" : String(raw);
  }
}

export function renderExplorerCell(
  spec: ExplorerColumnSpec,
  row: Record<string, unknown>,
): React.ReactNode {
  const raw = row[spec.accessorKey];
  const role = defaultCellRole(spec);

  const monoCls = "font-[family-name:var(--font-dm-mono)] text-[11px] tabular-nums";
  const mono10 = `${monoCls} text-[10px]`;
  const mono10b = `${mono10} font-bold`;

  const textPlain = raw == null || raw === "" ? "—" : String(raw);

  switch (role) {
    case "mono":
      return (
        <span className={monoCls}>
          {spec.kind === "date"
            ? formatExplorerDate(raw)
            : textPlain}
        </span>
      );
    case "mono10":
      return <span className={mono10}>{textPlain}</span>;
    case "mono10bold":
      return <span className={mono10b}>{textPlain}</span>;
    case "truncate140":
      return (
        <span className="block max-w-[140px] truncate text-[12px]" title={textPlain}>
          {textPlain}
        </span>
      );
    case "truncate160":
      return (
        <span className="block max-w-[160px] truncate text-[12px]" title={textPlain}>
          {textPlain}
        </span>
      );
    case "truncate180":
      return (
        <span className="block max-w-[180px] truncate text-[11px]" title={textPlain}>
          {textPlain}
        </span>
      );
    case "qtyGreen":
      return (
        <span className={`${monoCls} text-right font-bold text-[#027a48]`}>
          {formatInteger(raw)}
        </span>
      );
    case "integerRight":
      return (
        <span className={`${monoCls} text-right`}>{formatInteger(raw)}</span>
      );
    case "qtyBoldRight":
      return (
        <span className={`${monoCls} text-right font-bold`}>
          {formatInteger(raw)}
        </span>
      );
    case "moneyRight":
      return (
        <span className={`${monoCls} text-right text-[#1a56db]`}>
          {formatMoney(raw, spec.currencyKey ? row[spec.currencyKey] : "USD")}
        </span>
      );
    case "moneyRightBold":
      return (
        <span className={`${monoCls} text-right font-bold text-[#1a56db]`}>
          {formatMoney(raw, spec.currencyKey ? row[spec.currencyKey] : "USD")}
        </span>
      );
    case "moneyRightMuted":
      return (
        <span className={`${monoCls} text-right text-[#4b5563]`}>
          {formatMoney(raw, spec.currencyKey ? row[spec.currencyKey] : "USD")}
        </span>
      );
    case "chipDisposition":
      return (
        <Chip variant={dispositionChipVariant(raw)} mono>
          {textPlain}
        </Chip>
      );
    case "chipStatus":
      return (
        <Chip variant={statusChipVariant(raw)} mono>
          {textPlain}
        </Chip>
      );
    case "chipUnitStatus":
      return (
        <Chip variant={unitStatusChipVariant(raw)} mono>
          {textPlain}
        </Chip>
      );
    case "chipTeal":
      return <Chip variant="teal">{textPlain}</Chip>;
    case "chipBlue":
      return (
        <Chip variant="blue" mono>
          {textPlain}
        </Chip>
      );
    case "chipGrey":
      return <Chip variant="grey">{textPlain}</Chip>;
    case "fbaReceiptsGreen":
      return (
        <span className={`${monoCls} font-semibold text-[#027a48]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaCustShippedRed":
      return (
        <span className={`${monoCls} text-[#b42318]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaCustReturnsYellow":
      return (
        <span className={`${monoCls} text-[#92400e]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaVendorPurple":
      return (
        <span className={`${monoCls} text-[#5b21b6]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaFoundGreen":
      return (
        <span className={`${monoCls} text-[#027a48]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaLostRed":
      return (
        <span className={`${monoCls} text-[#b42318]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaDamagedOrange":
    case "fbaDisposedOrange":
    case "fbaOtherOrange":
    case "fbaUnknownOrange":
      return (
        <span className={`${monoCls} text-[#c2410c]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaTransferMono":
      return <span className={monoCls}>{formatInteger(raw)}</span>;
    case "fbaEndBlueBold":
      return (
        <span className={`${monoCls} font-bold text-[#1a56db]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaSummaryOpeningGreen":
      return (
        <span className={`${monoCls} font-semibold text-[#027a48]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaSummaryShippedRed":
      return (
        <span className={`${monoCls} text-[#b42318]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaSummaryCretTeal":
      return (
        <span className={`${monoCls} text-[#0d9488]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaSummaryVretPurple":
      return (
        <span className={`${monoCls} text-[#5b21b6]`}>
          {formatInteger(raw)}
        </span>
      );
    case "fbaSummaryEndBold":
      return (
        <span className={`${monoCls} text-right font-bold text-[#1a56db]`}>
          {formatInteger(raw)}
        </span>
      );
    default:
      if (spec.kind === "date")
        return <span className={monoCls}>{formatExplorerDate(raw)}</span>;
      if (spec.kind === "integer")
        return <span className={monoCls}>{formatInteger(raw)}</span>;
      if (spec.kind === "money")
        return (
          <span className={`${monoCls} text-right text-[#1a56db]`}>
            {formatMoney(raw, spec.currencyKey ? row[spec.currencyKey] : "USD")}
          </span>
        );
      return <span className="text-[12px]">{textPlain}</span>;
  }
}

function isRightAligned(role: ExplorerCellRole): boolean {
  return (
    role === "qtyGreen" ||
    role === "qtyBoldRight" ||
    role === "integerRight" ||
    role === "moneyRight" ||
    role === "moneyRightBold" ||
    role === "moneyRightMuted" ||
    role === "fbaSummaryEndBold"
  );
}

function buildColumns(specs: ExplorerColumnSpec[]): ColumnDef<
  Record<string, unknown>,
  unknown
>[] {
  return specs.map((spec) => ({
    id: spec.accessorKey,
    accessorFn: (row) => row[spec.accessorKey],
    header: spec.header,
    meta: { spec },
    enableSorting: false,
  }));
}

export type DataTableProps = {
  columnSpecs: ExplorerColumnSpec[];
  rows: Record<string, unknown>[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  emptyMessage?: string;
};

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100] as const;

export function DataTable({
  columnSpecs,
  rows,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  emptyMessage = "No rows match the current filters yet.",
}: DataTableProps) {
  const columns = React.useMemo(
    () => buildColumns(columnSpecs),
    [columnSpecs],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const sortedRows = table.getRowModel().rows;
  const pageCount = total <= 0 ? 1 : Math.ceil(total / pageSize);
  const rangeStart = total <= 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const pageButtons = React.useMemo(() => {
    const n = Math.min(7, pageCount);
    const buttons: number[] = [];
    if (pageCount <= 7) {
      for (let i = 1; i <= pageCount; i++) buttons.push(i);
      return buttons;
    }
    let start = Math.max(1, page - 3);
    const end = Math.min(pageCount, start + 6);
    if (end - start < 6) start = Math.max(1, end - 6);
    for (let i = start; i <= end; i++) buttons.push(i);
    return buttons;
  }, [page, pageCount]);

  const exportCsv = React.useCallback(() => {
    const headers = columnSpecs.map((c) => c.header);
    const lines = [
      headers.map(csvEscape).join(","),
      ...sortedRows.map((r) =>
        columnSpecs.map((spec) => csvEscape(csvCell(spec, r.original))).join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `data-explorer-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [columnSpecs, sortedRows]);

  if (total <= 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-[10px] border border-dashed border-[#e4e7ec] bg-white px-6 py-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <p className="text-sm font-semibold text-[#0f1117]">{emptyMessage}</p>
        <p className="mt-2 max-w-md text-xs text-[#9ca3af]">
          Upload the matching report type from Upload Reports to populate this
          dataset.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0 rounded-[10px] border border-[#e4e7ec] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e7ec] px-[14px] py-2.5">
        <span className="text-[11px] font-bold text-[#0f1117]">Report</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-[family-name:var(--font-dm-mono)] text-[11px] text-[#9ca3af]">
            {total.toLocaleString()} rows
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-[#c8cdd8] text-xs font-semibold"
            onClick={exportCsv}
          >
            <Download className="size-3.5" aria-hidden />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-180px)] overflow-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              {table.getHeaderGroups()[0]?.headers.map((header) => {
                const spec = (
                  header.column.columnDef.meta as { spec?: ExplorerColumnSpec }
                )?.spec;
                const role = spec ? defaultCellRole(spec) : "text";
                const alignRight = isRightAligned(role) || spec?.kind === "money";
                return (
                  <th
                    key={header.id}
                    className={`sticky top-0 z-20 whitespace-nowrap border-b-2 border-[#e4e7ec] bg-[#f8fafc] px-[11px] py-[7px] text-left text-[9.5px] font-bold uppercase tracking-[0.6px] text-[#9ca3af] shadow-[0_1px_0_0_#e4e7ec] first:pl-[14px] ${
                      alignRight ? "text-right" : ""
                    }`}
                  >
                    <span className="font-[family-name:var(--font-dm-sans)]">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-[14px] py-10 text-center text-sm text-[#9ca3af]"
                >
                  No rows on this page.
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[#f1f5f9] transition-colors hover:bg-[#fafbfd]"
                >
                  {row.getVisibleCells().map((cell) => {
                    const spec = (
                      cell.column.columnDef.meta as {
                        spec?: ExplorerColumnSpec;
                      }
                    )?.spec;
                    const role = spec ? defaultCellRole(spec) : "text";
                    const alignRight = isRightAligned(role) || spec?.kind === "money";
                    const content =
                      spec != null
                        ? renderExplorerCell(spec, row.original)
                        : flexRender(cell.column.columnDef.cell, cell.getContext());
                    return (
                      <td
                        key={cell.id}
                        className={`px-[11px] py-[7px] align-middle text-[12px] text-[#0f1117] first:pl-[14px] ${
                          alignRight ? "text-right" : ""
                        }`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e4e7ec] px-[14px] py-2.5 text-[11px] text-[#9ca3af]">
        <span className="font-[family-name:var(--font-dm-mono)] tabular-nums">
          {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of{" "}
          {total.toLocaleString()}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {onPageSizeChange ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-[#9ca3af]">
                Rows
              </span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="h-7 rounded-md border border-[#c8cdd8] bg-white px-1.5 text-[11px] font-semibold text-[#4b5563] outline-none focus:border-[#1a56db]"
              >
                {PAGE_SIZE_OPTIONS.map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            className="rounded-md border border-[#c8cdd8] bg-white px-2.5 py-1 text-xs font-semibold text-[#4b5563] disabled:cursor-not-allowed disabled:opacity-35 hover:bg-[#eff4ff] hover:text-[#1a56db]"
            onClick={() => onPageChange(page - 1)}
          >
            ← Prev
          </button>
          {pageButtons.map((pn) => (
            <button
              key={pn}
              type="button"
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                pn === page
                  ? "border-[#1a56db] bg-[#1a56db] text-white"
                  : "border-[#c8cdd8] bg-white text-[#4b5563] hover:bg-[#eff4ff] hover:text-[#1a56db]"
              }`}
              onClick={() => onPageChange(pn)}
            >
              {pn}
            </button>
          ))}
          <button
            type="button"
            disabled={page >= pageCount}
            className="rounded-md border border-[#c8cdd8] bg-white px-2.5 py-1 text-xs font-semibold text-[#4b5563] disabled:cursor-not-allowed disabled:opacity-35 hover:bg-[#eff4ff] hover:text-[#1a56db]"
            onClick={() => onPageChange(page + 1)}
          >
            Next →
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
