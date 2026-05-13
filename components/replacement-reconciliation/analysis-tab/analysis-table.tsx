"use client";

import * as React from "react";
import { ScrollText, Wrench } from "lucide-react";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CaseStatusBadge,
  ReplacementStatusBadge,
} from "@/components/replacement-reconciliation/shared/status-badge";
import { CellHoverPopover, CellHoverRow } from "@/components/shared/cell-hover-popover";
import { Pagination } from "@/components/shared/Pagination";
import type { ReplacementReconRow } from "@/lib/replacement-reconciliation/types";

export function AnalysisTable({
  rows,
  onRaiseCase,
  onAdjust,
  visibility,
}: {
  rows: ReplacementReconRow[];
  onRaiseCase: (row: ReplacementReconRow) => void;
  onAdjust: (row: ReplacementReconRow) => void;
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
        <span className="text-3xl">🔄</span>
        <p className="text-sm font-semibold text-foreground">No replacements found</p>
        <p className="text-xs">Upload Replacement Shipments report or adjust filters</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
    <div className="rounded-md border border-slate-200 bg-white">
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
          <TableRow>
            {REPLACEMENT_ANALYSIS_COLUMNS.filter((c) => show(c.id)).map((c) => (
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
              r.status === "TAKE_ACTION"
                ? "bg-red-50/40"
                : r.status === "PARTIAL"
                  ? "bg-amber-50/40"
                  : "";
            return (
              <TableRow key={r.id} className={cn("hover:bg-slate-50", rowBg)}>
                {show("shipment_date") && <TableCell className="font-mono text-[10px]">{r.shipmentDate || "—"}</TableCell>}
                {show("msku") && <TableCell className="font-mono text-[11px] font-semibold">{r.msku}</TableCell>}
                {show("asin") && <TableCell className="font-mono text-[10px]">{r.asin}</TableCell>}
                {show("qty") && (
                  <TableCell className="text-right font-mono text-xs font-bold text-blue-700">
                    {r.quantity}
                  </TableCell>
                )}
                {show("repl_order") && (
                  <TableCell className="font-mono text-[10px] font-semibold text-purple-700">
                    {r.replacementOrderId}
                  </TableCell>
                )}
                {show("orig_order") && (
                  <TableCell className="font-mono text-[10px] text-slate-600">
                    {r.originalOrderId}
                  </TableCell>
                )}
                {show("reason") && (
                  <TableCell className="max-w-[110px] truncate text-[10px]" title={r.replacementReasonCode}>
                    {r.replacementReasonCode}
                  </TableCell>
                )}
                {show("return_qty") && (
                <TableCell className="text-right font-mono text-xs">
                  {r.returnQty > 0 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <b className="cursor-help text-blue-700">{r.returnQty}</b>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-[11px]">
                        <div className="space-y-1">
                          <div><b>Matched via:</b> {r.returnMatchedVia || "—"}</div>
                          <div><b>Order(s):</b> {r.matchedReturnOrder || "—"}</div>
                          {r.returnDispositions ? <div><b>Disposition:</b> {r.returnDispositions}</div> : null}
                          {r.returnReasons ? <div><b>Reason:</b> {r.returnReasons}</div> : null}
                          {r.returnDate ? <div><b>Date:</b> {r.returnDate}</div> : null}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    "—"
                  )}
                </TableCell>
                )}
                {show("reimb_qty") && (
                <TableCell className="text-right font-mono text-xs">
                  {r.effectiveReimbQty > 0 ? (
                    <CellHoverPopover
                      side="left"
                      width={300}
                      title="Reimbursement breakdown"
                      triggerClassName="text-right w-full"
                      trigger={<b className="text-emerald-700">{r.effectiveReimbQty}</b>}
                    >
                      <CellHoverRow left="Direct Reimb Qty" right={r.reimbQty} />
                      <CellHoverRow left="Case Approved Qty" right={r.caseApprovedQty} />
                      <CellHoverRow left="Adj Qty" right={r.adjQty} />
                      <CellHoverRow
                        left={<b>Effective Total</b>}
                        right={<b>{r.effectiveReimbQty}</b>}
                      />
                      {r.reimbReason ? <CellHoverRow left="Reason" right={r.reimbReason} /> : null}
                      {r.reimbIds ? <CellHoverRow left="IDs" right={r.reimbIds} /> : null}
                      {r.reimbApprovalDate ? (
                        <CellHoverRow left="Approved" right={r.reimbApprovalDate} />
                      ) : null}
                    </CellHoverPopover>
                  ) : (
                    "—"
                  )}
                </TableCell>
                )}
                {show("reimb_amt") && (
                <TableCell className="text-right font-mono text-xs">
                  {r.effectiveReimbAmount > 0 ? (
                    <CellHoverPopover
                      side="left"
                      width={300}
                      title="Reimbursement breakdown"
                      triggerClassName="text-right w-full"
                      trigger={
                        <b className="text-emerald-700">
                          ${r.effectiveReimbAmount.toFixed(2)}
                        </b>
                      }
                    >
                      <CellHoverRow left="Direct Reimb Qty" right={r.reimbQty} />
                      <CellHoverRow left="Case Approved Qty" right={r.caseApprovedQty} />
                      <CellHoverRow left="Adj Qty" right={r.adjQty} />
                      <CellHoverRow
                        left={<b>Effective Qty</b>}
                        right={<b>{r.effectiveReimbQty}</b>}
                      />
                      <CellHoverRow
                        left={<b>Effective Amount</b>}
                        right={<b>${r.effectiveReimbAmount.toFixed(2)}</b>}
                      />
                    </CellHoverPopover>
                  ) : (
                    "—"
                  )}
                </TableCell>
                )}
                {show("case") && (
                  <TableCell>
                    <CaseStatusBadge status={r.caseTopStatus} count={r.caseCount} />
                  </TableCell>
                )}
                {show("status") && (
                  <TableCell>
                    <ReplacementStatusBadge status={r.status} />
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

export const REPLACEMENT_ANALYSIS_COLUMNS = [
  { id: "shipment_date", label: "Shipment Date", align: "left" as const },
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "asin", label: "ASIN", align: "left" as const },
  { id: "qty", label: "Repl. Qty", align: "right" as const },
  { id: "repl_order", label: "Replacement Order", align: "left" as const },
  { id: "orig_order", label: "Original Order", align: "left" as const },
  { id: "reason", label: "Reason", align: "left" as const },
  { id: "return_qty", label: "Returned", align: "right" as const },
  { id: "reimb_qty", label: "Reimb. Qty", align: "right" as const },
  { id: "reimb_amt", label: "Reimb. $", align: "right" as const },
  { id: "case", label: "Case", align: "left" as const },
  { id: "status", label: "Status", align: "left" as const },
  { id: "actions", label: "Actions", align: "left" as const },
];

function Actions({
  row,
  onRaiseCase,
  onAdjust,
}: {
  row: ReplacementReconRow;
  onRaiseCase: (row: ReplacementReconRow) => void;
  onAdjust: (row: ReplacementReconRow) => void;
}) {
  const isCovered = row.status === "RESOLVED" || row.status === "REIMBURSED" || row.status === "RETURNED";
  const showRaise = !isCovered && row.caseCount === 0;
  return (
    <div className="flex gap-1">
      {isCovered ? (
        <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-[10px] font-bold text-emerald-700">
          ✓ Covered
        </Badge>
      ) : null}
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
