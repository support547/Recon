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
import { ReplacementStatusBadge } from "@/components/replacement-reconciliation/shared/status-badge";
import { CellHoverPopover, CellHoverRow } from "@/components/shared/cell-hover-popover";
import { Pagination } from "@/components/shared/Pagination";
import type { ReplacementReconRow } from "@/lib/replacement-reconciliation/types";

type QtyCol = "qty" | "return_qty" | "reimb_qty" | "refund_qty" | "adj_qty";

const QTY_ACCESSOR: Record<QtyCol, (r: ReplacementReconRow) => number> = {
  qty: (r) => r.quantity,
  return_qty: (r) => r.returnQty,
  reimb_qty: (r) => r.effectiveReimbQty,
  refund_qty: (r) => r.refundQty,
  adj_qty: (r) => r.adjQty,
};

function isQtyCol(id: string): id is QtyCol {
  return id in QTY_ACCESSOR;
}

export function AnalysisTable({
  rows,
  onRaiseCase,
  onAdjust,
  visibility,
  view = "msku",
  reasonsByAsin,
  mskuByAsin,
}: {
  rows: ReplacementReconRow[];
  onRaiseCase: (row: ReplacementReconRow) => void;
  onAdjust: (row: ReplacementReconRow) => void;
  visibility?: Record<string, boolean>;
  view?: "msku" | "asin";
  /** ASIN → unique reason list. Used only in `view="asin"` for qty tooltip. */
  reasonsByAsin?: Map<string, string[]>;
  /** ASIN → list of {msku, qty}. Used only in `view="asin"` for ASIN cell tooltip. */
  mskuByAsin?: Map<string, { msku: string; qty: number }[]>;
}) {
  const HIDDEN_IN_ASIN = new Set(["msku", "repl_order", "orig_order", "reason"]);
  const show = (id: string) => {
    if (view === "asin" && HIDDEN_IN_ASIN.has(id)) return false;
    return visibility?.[id] !== false;
  };
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  // Clickable column-total filter (mirrors Returns Recon): each key narrows to
  // rows with a non-zero value in that column. Multi-select, AND predicate.
  const [qtyFilter, setQtyFilter] = React.useState<Set<QtyCol>>(new Set());
  const toggleQtyCol = (c: QtyCol) => {
    setQtyFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
    setPage(1);
  };
  React.useEffect(() => { setPage(1); }, [rows]);

  const filteredRows = React.useMemo(() => {
    if (qtyFilter.size === 0) return rows;
    return rows.filter((r) => [...qtyFilter].every((c) => QTY_ACCESSOR[c](r) !== 0));
  }, [rows, qtyFilter]);

  // Column totals summed over the search/status-scoped set (before col filter).
  const totals = React.useMemo(() => {
    const t: Record<QtyCol, number> = { qty: 0, return_qty: 0, reimb_qty: 0, refund_qty: 0, adj_qty: 0 };
    for (const r of rows) {
      t.qty += r.quantity;
      t.return_qty += r.returnQty;
      t.reimb_qty += r.effectiveReimbQty;
      t.refund_qty += r.refundQty;
      t.adj_qty += r.adjQty;
    }
    return t;
  }, [rows]);

  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const totalCell = (colId: string): React.ReactNode => {
    if (!isQtyCol(colId)) return null;
    const active = qtyFilter.has(colId);
    return (
      <button
        type="button"
        onClick={() => toggleQtyCol(colId)}
        title="Click to show only rows with a value in this column"
        className={cn(
          "rounded font-mono text-[11px] font-bold tabular-nums transition",
          active
            ? "bg-blue-600 px-1.5 py-0.5 text-white"
            : "px-1 py-0.5 text-blue-600 hover:bg-blue-50",
        )}
      >
        {totals[colId].toLocaleString()}
      </button>
    );
  };
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
      <table className="w-full caption-bottom text-sm [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle">
        <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
          <TableRow>
            {REPLACEMENT_ANALYSIS_COLUMNS.filter((c) => show(c.id)).map((c) => {
              const hasTotal = c.id in totals;
              return (
                <TableHead
                  key={c.id}
                  className={cn(
                    "whitespace-nowrap h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3",
                    c.align === "right" && "text-right",
                  )}
                >
                  <div
                    className={cn(
                      "flex flex-col gap-0.5",
                      c.align === "right" ? "items-end" : "items-start",
                    )}
                  >
                    <span>{c.label}</span>
                    {hasTotal ? (
                      <span className="normal-case tracking-normal">{totalCell(c.id)}</span>
                    ) : null}
                  </div>
                </TableHead>
              );
            })}
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
                {show("days") && (
                  <TableCell className="text-right font-mono text-[11px]">
                    {r.daysSinceShipment === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={cn(
                          "font-bold",
                          r.daysSinceShipment >= 45
                            ? "text-red-600"
                            : r.daysSinceShipment >= 30
                              ? "text-amber-700"
                              : "text-slate-600",
                        )}
                      >
                        {r.daysSinceShipment}d
                      </span>
                    )}
                  </TableCell>
                )}
                {show("msku") && <TableCell className="font-mono text-[11px] font-semibold">{r.msku}</TableCell>}
                {show("asin") && (
                  <TableCell className="font-mono text-[10px]">
                    {view === "asin" ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted">
                            {r.asin}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-sm text-[11px]">
                          <div className="space-y-1">
                            <div><b>MSKUs ({mskuByAsin?.get(r.asin)?.length ?? 0}):</b></div>
                            <div className="space-y-0.5">
                              {(mskuByAsin?.get(r.asin) ?? []).map((x) => (
                                <div key={x.msku} className="flex justify-between gap-3 font-mono text-[10px]">
                                  <span>{x.msku}</span>
                                  <b>{x.qty}</b>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      r.asin
                    )}
                  </TableCell>
                )}
                {show("reason") && (
                  <TableCell className="max-w-[110px] truncate text-[10px]" title={r.replacementReasonCode}>
                    {r.replacementReasonCode}
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
                {show("qty") && (
                  <TableCell className="text-right font-mono text-xs font-bold text-blue-700">
                    {view === "asin" ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted">
                            {r.quantity}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs text-[11px]">
                          <div className="space-y-1">
                            <div><b>Reasons:</b></div>
                            <div>
                              {(reasonsByAsin?.get(r.asin) ?? []).filter(Boolean).join(", ") || "—"}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      r.quantity
                    )}
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
                      {r.reimbOrderIds ? <CellHoverRow left="Order ID" right={r.reimbOrderIds} /> : null}
                      {r.reimbIds ? <CellHoverRow left="Reimbursement ID" right={r.reimbIds} /> : null}
                      {r.reimbApprovalDate ? (
                        <CellHoverRow left="Approved" right={r.reimbApprovalDate} />
                      ) : null}
                    </CellHoverPopover>
                  ) : (
                    "—"
                  )}
                </TableCell>
                )}
                {show("refund_qty") && (
                  <TableCell className="text-right font-mono text-xs">
                    {r.refundQty > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <b className="cursor-help text-emerald-700">{r.refundQty}</b>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-sm text-[11px]">
                          <div className="space-y-1.5">
                            <div className="font-semibold">Refund lines ({r.refundLines.length})</div>
                            {r.refundLines.map((l, i) => (
                              <div key={i} className="space-y-0.5 border-t border-white/20 pt-1 first:border-0 first:pt-0">
                                <div><b>Order ID:</b> {l.orderId || "—"}</div>
                                <div><b>Qty:</b> {l.qty}</div>
                                <div><b>Total Amount:</b> ${l.amount.toFixed(2)}</div>
                                <div><b>Settlement ID:</b> {l.settlementId || "—"}</div>
                                <div><b>Date:</b> {l.date || "—"}</div>
                              </div>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                {show("adj_qty") && (
                  <TableCell className="text-right font-mono text-xs">
                    {r.adjQty !== 0 ? (
                      <b className="text-blue-700">{r.adjQty}</b>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                {show("case") && (
                  <TableCell className="text-right font-mono text-xs">
                    {r.caseCount > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <b className="cursor-help text-orange-600">+{r.caseClaimedQty}</b>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs text-[11px]">
                          <div className="space-y-0.5">
                            <div><b>Status:</b> {r.caseTopStatus}</div>
                            <div><b>Claimed:</b> {r.caseClaimedQty}</div>
                            {r.caseApprovedQty > 0 ? (
                              <div><b>Approved:</b> {r.caseApprovedQty}{r.caseApprovedAmount > 0 ? ` · $${r.caseApprovedAmount.toFixed(2)}` : ""}</div>
                            ) : null}
                            <div><b>Cases:</b> {r.caseCount}</div>
                            <div><b>Case ID:</b> {r.caseIds || "—"}</div>
                            {r.caseRemarks ? <div><b>Remarks:</b> {r.caseRemarks}</div> : null}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
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
    <Pagination page={page} pageSize={pageSize} totalRows={filteredRows.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}

export const REPLACEMENT_ANALYSIS_COLUMNS = [
  { id: "shipment_date", label: "Shipment Date", align: "left" as const },
  { id: "days", label: "Days", align: "right" as const },
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "asin", label: "ASIN", align: "left" as const },
  { id: "reason", label: "Reason", align: "left" as const },
  { id: "repl_order", label: "Replacement Order", align: "left" as const },
  { id: "orig_order", label: "Original Order", align: "left" as const },
  { id: "qty", label: "Repl. Qty", align: "right" as const },
  { id: "return_qty", label: "Returned", align: "right" as const },
  { id: "reimb_qty", label: "Reimb. Qty", align: "right" as const },
  { id: "refund_qty", label: "Refund Qty", align: "right" as const },
  { id: "adj_qty", label: "Adjt Qty", align: "right" as const },
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
  const isCovered = row.status === "RESOLVED" || row.status === "REIMBURSED" || row.status === "RETURNED" || row.status === "ADJUSTED";
  // Allow raising another case even after one exists, as long as the row isn't covered.
  const showRaise = !isCovered;
  return (
    <div className="flex gap-1">
      {isCovered ? (
        <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-[10px] font-bold text-emerald-700">
          ✓ Covered
        </Badge>
      ) : null}
      {showRaise ? (
        <button
          type="button"
          onClick={() => onRaiseCase(row)}
          className="flex h-6 items-center gap-1 rounded bg-amber-500 px-2 text-[10px] font-bold text-white hover:bg-amber-600"
          title={row.caseCount > 0 ? "Raise Another Case" : "Raise Case"}
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
