"use client";

import * as React from "react";
import { DollarSign, ScrollText, Wrench } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
}: {
  rows: ReturnsReconRow[];
  onRaiseCase: (row: ReturnsReconRow) => void;
  onAdjust: (row: ReturnsReconRow) => void;
}) {
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
    <div className="max-h-[70vh] overflow-y-auto rounded-md border border-slate-200 bg-white">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead
                key={c.id}
                className={cn(
                  "whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground",
                  c.align === "right" && "text-right",
                )}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const rowBg =
              r.fnskuStatus === "FNSKU_MISMATCH"
                ? "bg-red-50/40"
                : r.fnskuStatus === "ORDER_NOT_FOUND"
                  ? "bg-amber-50/40"
                  : "";
            return (
              <TableRow key={`${r.orderId}|${r.returnFnsku}`} className={cn("hover:bg-slate-50", rowBg)}>
                <TableCell className="font-mono text-[10px] font-semibold">{r.orderId}</TableCell>
                <TableCell className="font-mono text-[10px]">{r.returnFnsku}</TableCell>
                <TableCell className="font-mono text-[11px] font-semibold">{r.msku}</TableCell>
                <TableCell className="font-mono text-[10px]">{r.asin}</TableCell>
                <TableCell className="max-w-[160px] truncate text-[11px]" title={r.title}>
                  {r.title}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-bold text-blue-700">
                  {r.totalReturned}
                </TableCell>
                <TableCell className="text-right text-[11px] text-muted-foreground">
                  {r.returnEvents}
                </TableCell>
                <TableCell className="max-w-[120px] truncate text-[10px]" title={r.dispositions}>
                  {r.dispositions ? (
                    <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                      {r.dispositions.split(",")[0]}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="max-w-[140px] truncate text-[10px] text-muted-foreground" title={r.reasons}>
                  {r.reasons || "—"}
                </TableCell>
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
                <TableCell>
                  <FnskuStatusBadge status={r.fnskuStatus} />
                </TableCell>
                <TableCell>
                  <CaseStatusBadge status={r.caseStatusTop} count={r.caseCount} />
                </TableCell>
                <TableCell className="font-mono text-[10px] text-muted-foreground">
                  {r.earliestReturn === r.latestReturn
                    ? r.earliestReturn || "—"
                    : `${r.earliestReturn} → ${r.latestReturn}`}
                </TableCell>
                <TableCell>
                  <Actions row={r} onRaiseCase={onRaiseCase} onAdjust={onAdjust} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const COLUMNS = [
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
