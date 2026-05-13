"use client";

import * as React from "react";
import { DollarSign, ScrollText, Wrench } from "lucide-react";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/shared/Pagination";
import { cn } from "@/lib/utils";
import {
  CaseStatusBadge,
  FnskuStatusBadge,
} from "@/components/returns-reconciliation/shared/fnsku-status-badge";
import { CellHoverPopover, CellHoverRow } from "@/components/shared/cell-hover-popover";
import type { ReturnsReconRow } from "@/lib/returns-reconciliation/types";

export function AnalysisTable({
  rows,
  onRaiseCase,
  onAdjust,
  visibility,
}: {
  rows: ReturnsReconRow[];
  onRaiseCase: (row: ReturnsReconRow) => void;
  onAdjust: (row: ReturnsReconRow) => void;
  visibility?: Record<string, boolean>;
}) {
  const show = (id: string) => visibility?.[id] !== false;
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  React.useEffect(() => { setPage(1); }, [rows]);
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">↩</span>
        <p className="text-sm font-semibold text-foreground">No returns found</p>
        <p className="text-xs">Upload Customer Returns report or adjust filters</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
    <div className="rounded-md border border-slate-200 bg-white">
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
          <TableRow>
            {RETURNS_ANALYSIS_COLUMNS.filter((c) => show(c.id)).map((c) => (
              <TableHead
                key={c.id}
                className={cn(
                  "whitespace-nowrap h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3",
                  c.align === "right" && "text-right",
                )}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRows.map((r) => {
            const rowBg =
              r.fnskuStatus === "FNSKU_MISMATCH"
                ? "bg-red-50/40"
                : r.fnskuStatus === "ORDER_NOT_FOUND"
                  ? "bg-amber-50/40"
                  : "";
            return (
              <TableRow key={`${r.orderId}|${r.returnFnsku}`} className={cn("hover:bg-slate-50", rowBg)}>
                {show("order_id") && <TableCell className="font-mono text-[10px] font-semibold">{r.orderId}</TableCell>}
                {show("return_fnsku") && <TableCell className="font-mono text-[10px]">{r.returnFnsku}</TableCell>}
                {show("msku") && <TableCell className="font-mono text-[11px] font-semibold">{r.msku}</TableCell>}
                {show("asin") && <TableCell className="font-mono text-[10px]">{r.asin}</TableCell>}
                {show("title") && (
                  <TableCell className="max-w-[160px] truncate text-[11px]" title={r.title}>
                    {r.title}
                  </TableCell>
                )}
                {show("returned_qty") && (
                  <TableCell className="text-right font-mono text-xs font-bold text-blue-700">
                    {r.totalReturned}
                  </TableCell>
                )}
                {show("events") && (
                  <TableCell className="text-right text-[11px] text-muted-foreground">
                    {r.returnEvents}
                  </TableCell>
                )}
                {show("disp") && (
                  <TableCell className="max-w-[120px] truncate text-[10px]" title={r.dispositions}>
                    {r.dispositions ? (
                      <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                        {r.dispositions.split(",")[0]}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                {show("reasons") && (
                  <TableCell className="max-w-[140px] truncate text-[10px] text-muted-foreground" title={r.reasons}>
                    {r.reasons || "—"}
                  </TableCell>
                )}
                {show("reimb_qty") && (
                  <TableCell className="text-right font-mono text-xs">
                    {r.effReimbQty > 0 ? (
                      <CellHoverPopover
                        trigger={<b className="text-emerald-700">{r.effReimbQty}</b>}
                        title="Reimbursement breakdown"
                        side="left"
                        width={280}
                      >
                        <CellHoverRow left="Direct (RR)" right={r.reimbQty} />
                        <CellHoverRow left="Via Case" right={r.caseReimbQty} />
                        <CellHoverRow left="Manual Adj" right={r.adjQty} />
                        <CellHoverRow left="Effective" right={r.effReimbQty} />
                      </CellHoverPopover>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                {show("reimb_amt") && (
                  <TableCell className="text-right font-mono text-xs">
                    {r.effReimbAmount > 0 ? (
                      <CellHoverPopover
                        trigger={<b className="text-emerald-700">${r.effReimbAmount.toFixed(2)}</b>}
                        title="Reimbursement $"
                        side="left"
                        width={280}
                      >
                        <CellHoverRow left="Direct (RR)" right={'$' + r.reimbAmount.toFixed(2)} />
                        <CellHoverRow left="Via Case" right={'$' + r.caseReimbAmount.toFixed(2)} />
                        <CellHoverRow left="Effective" right={'$' + r.effReimbAmount.toFixed(2)} />
                      </CellHoverPopover>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                {show("sales_fnsku") && (
                  <TableCell className="font-mono text-[10px]">
                    {r.salesFnsku ? (
                      r.fnskuStatus === "FNSKU_MISMATCH" ? (
                        <span className="font-bold text-red-600">{r.salesFnsku}</span>
                      ) : (
                        <span className="text-emerald-700">{r.salesFnsku}</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">Not in Sales</span>
                    )}
                  </TableCell>
                )}
                {show("fnsku_status") && (
                  <TableCell>
                    <FnskuStatusBadge status={r.fnskuStatus} />
                  </TableCell>
                )}
                {show("case") && (
                  <TableCell>
                    <CaseStatusBadge status={r.caseStatusTop} count={r.caseCount} />
                  </TableCell>
                )}
                {show("date_range") && (
                  <TableCell className="font-mono text-[10px] text-muted-foreground">
                    {r.earliestReturn === r.latestReturn
                      ? r.earliestReturn || "—"
                      : `${r.earliestReturn} → ${r.latestReturn}`}
                  </TableCell>
                )}
                {show("actions") && (
                  <TableCell>
                    <Actions row={r} onRaiseCase={onRaiseCase} onAdjust={onAdjust} />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </table>
    </div>
    <Pagination page={page} pageSize={pageSize} totalRows={rows.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}

export const RETURNS_ANALYSIS_COLUMNS = [
  { id: "order_id", label: "Order ID", align: "left" as const },
  { id: "return_fnsku", label: "Return FNSKU", align: "left" as const },
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "asin", label: "ASIN", align: "left" as const },
  { id: "title", label: "Title", align: "left" as const },
  { id: "returned_qty", label: "Returned", align: "right" as const },
  { id: "events", label: "Events", align: "right" as const },
  { id: "disp", label: "Disposition", align: "left" as const },
  { id: "reasons", label: "Reasons", align: "left" as const },
  { id: "reimb_qty", label: "Reimb. Qty", align: "right" as const },
  { id: "reimb_amt", label: "Reimb. $", align: "right" as const },
  { id: "sales_fnsku", label: "Sales FNSKU", align: "left" as const },
  { id: "fnsku_status", label: "FNSKU Status", align: "left" as const },
  { id: "case", label: "Case", align: "left" as const },
  { id: "date_range", label: "Date Range", align: "left" as const },
  { id: "actions", label: "Actions", align: "left" as const },
];

function Actions({
  row,
  onRaiseCase,
  onAdjust,
}: {
  row: ReturnsReconRow;
  onRaiseCase: (row: ReturnsReconRow) => void;
  onAdjust: (row: ReturnsReconRow) => void;
}) {
  const showRaise = row.fnskuStatus !== "MATCHED_FNSKU" && row.caseCount === 0;
  return (
    <div className="flex gap-1">
      {row.caseCount > 0 ? (
        <span className="flex h-6 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700">
          ⚖️ {row.caseCount} Case{row.caseCount > 1 ? "s" : ""}
        </span>
      ) : showRaise ? (
        <button
          type="button"
          onClick={() => onRaiseCase(row)}
          className="flex h-6 items-center gap-1 rounded bg-amber-500 px-2 text-[10px] font-bold text-white hover:bg-amber-600"
          title="Raise Case"
        >
          <ScrollText className="size-3" aria-hidden /> Raise Case
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onAdjust(row)}
        className="flex h-6 items-center gap-1 rounded bg-blue-600 px-2 text-[10px] font-bold text-white hover:bg-blue-700"
        title="Manual Adjustment"
      >
        <Wrench className="size-3" aria-hidden /> Adjust
      </button>
    </div>
  );
}
