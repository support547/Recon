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
  ConditionBadge,
  GnrStatusBadge,
} from "@/components/gnr-reconciliation/shared/status-badge";
import { CellHoverPopover, CellHoverRow } from "@/components/shared/cell-hover-popover";
import { RemarksCell } from "@/components/shared/remarks-cell";
import { Pagination } from "@/components/shared/Pagination";
import type { GnrReconRow } from "@/lib/gnr-reconciliation/types";

type RemarkSaveResult = { ok: true } | { ok: false; error: string };

export function AnalysisTable({
  rows,
  onRaiseCase,
  onAdjust,
  remarks,
  onSaveRemark,
  visibility,
}: {
  rows: GnrReconRow[];
  onRaiseCase: (row: GnrReconRow) => void;
  onAdjust: (row: GnrReconRow) => void;
  remarks?: Record<string, string>;
  onSaveRemark?: (
    usedMsku: string,
    usedFnsku: string,
    next: string,
  ) => Promise<RemarkSaveResult>;
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
        <span className="text-3xl">♻</span>
        <p className="text-sm font-semibold text-foreground">No GNR data</p>
        <p className="text-xs">Upload Grade &amp; Resell report or add manual entries</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
    <div className="rounded-md border border-slate-200 bg-white">
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
          <TableRow>
            {GNR_ANALYSIS_COLUMNS.filter((c) => show(c.id)).map((c) => (
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
            const isManual = r.usedMsku.startsWith("Manual: ");
            const displayMsku = isManual ? r.usedMsku.replace(/^Manual: /, "") : r.usedMsku;
            const rowBg =
              r.actionStatus === "take-action"
                ? "bg-red-50/40"
                : r.actionStatus === "over-accounted"
                  ? "bg-purple-50/30"
                  : r.actionStatus === "review"
                    ? "bg-pink-50/30"
                    : "";
            const totalReimb = r.caseApprovedQty + r.adjQty;
            return (
              <TableRow
                key={`${r.usedMsku}|${r.usedFnsku}`}
                className={cn("hover:bg-slate-50", rowBg)}
              >
                {show("used_msku") && (
                  <TableCell className="font-mono text-[11px] font-semibold">
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-[180px] truncate" title={r.usedMsku}>
                        {displayMsku}
                      </span>
                      {isManual ? (
                        <Badge variant="outline" className="rounded border-purple-200 bg-purple-50 px-1.5 text-[9px] font-bold text-purple-700">
                          Manual
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                )}
                {show("used_fnsku") && <TableCell className="font-mono text-[10px] text-slate-600">{r.usedFnsku}</TableCell>}
                {show("orig_fnsku") && <TableCell className="font-mono text-[10px] text-slate-500">{r.origFnsku}</TableCell>}
                {show("asin") && <TableCell className="font-mono text-[10px]">{r.asin}</TableCell>}
                {show("condition") && (
                  <TableCell>
                    <ConditionBadge value={r.usedCondition} />
                  </TableCell>
                )}
                {show("gnr_qty") && (
                <TableCell className="text-right font-mono text-xs font-bold">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">{r.gnrQty}</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-[11px]">
                      <div className="space-y-1">
                        <div><b>GNR Qty:</b> {r.gnrQty}</div>
                        <div><b>Succeeded:</b> <span className="text-emerald-300">{r.succeededQty}</span></div>
                        <div><b>Failed:</b> <span className={r.failedQty > 0 ? "text-red-300" : ""}>{r.failedQty}</span></div>
                        <div><b>Orders:</b> {r.orderCount}</div>
                        {r.firstDate ? (
                          <div><b>Date range:</b> {r.firstDate}{r.firstDate !== r.lastDate ? ` → ${r.lastDate}` : ""}</div>
                        ) : null}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                )}
                {show("sales_qty") && (
                  <TableCell className="text-right font-mono text-xs text-slate-600">
                    {r.salesQty || "—"}
                  </TableCell>
                )}
                {show("return_qty") && (
                  <TableCell className={cn("text-right font-mono text-xs", r.returnQty > 0 ? "text-emerald-600 font-semibold" : "text-slate-400")}>
                    {r.returnQty || "—"}
                  </TableCell>
                )}
                {show("removal_qty") && (
                  <TableCell className={cn("text-right font-mono text-xs", r.removalQty > 0 ? "text-amber-700 font-semibold" : "text-slate-400")}>
                    {r.removalQty || "—"}
                  </TableCell>
                )}
                {show("reimb_qty") && (
                <TableCell className="text-right font-mono text-xs">
                  {totalReimb > 0 || r.caseApprovedAmount > 0 ? (
                    <CellHoverPopover
                      side="left"
                      width={300}
                      title="Reimbursement breakdown"
                      triggerClassName="font-bold text-emerald-700"
                      trigger={
                        <span>
                          {totalReimb}
                          {r.caseApprovedAmount > 0 ? (
                            <span className="ml-1 text-[9px] font-semibold text-emerald-600">${r.caseApprovedAmount.toFixed(2)}</span>
                          ) : null}
                        </span>
                      }
                    >
                      {r.caseApprovedQty > 0 ? (
                        <CellHoverRow left="Direct / RR Qty" right={r.caseApprovedQty} />
                      ) : null}
                      {r.adjQty > 0 ? (
                        <CellHoverRow left="Case Qty" right={`+${r.adjQty}`} />
                      ) : null}
                      <CellHoverRow left={<b>Total Qty</b>} right={<b>{totalReimb}</b>} />
                      {r.caseApprovedAmount > 0 ? (
                        <CellHoverRow left="Approved $" right={`$${r.caseApprovedAmount.toFixed(2)}`} />
                      ) : null}
                      {r.caseIds ? <CellHoverRow left="Case ID(s)" right={r.caseIds} /> : null}
                      {r.caseTopStatus ? <CellHoverRow left="Status" right={r.caseTopStatus} /> : null}
                      {r.caseClaimedQty > 0 ? <CellHoverRow left="Claimed" right={r.caseClaimedQty} /> : null}
                      {r.adjReasons ? <CellHoverRow left="Adj Reason" right={r.adjReasons} /> : null}
                      {r.caseReasons ? <CellHoverRow left="Case Reason" right={r.caseReasons} /> : null}
                    </CellHoverPopover>
                  ) : r.caseCount > 0 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help font-bold text-amber-700">⏳ {r.caseTopStatus || "Pending"}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-[11px]">
                        <div className="space-y-1">
                          {r.caseIds ? <div><b>Case IDs:</b> {r.caseIds}</div> : null}
                          {r.caseClaimedQty > 0 ? <div><b>Claimed:</b> {r.caseClaimedQty}</div> : null}
                          <div><b>Approved:</b> Pending</div>
                          {r.caseReasons ? <div><b>Reason:</b> {r.caseReasons}</div> : null}
                          {r.caseNotes ? <div><b>Notes:</b> {r.caseNotes}</div> : null}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                )}
                {show("ending_bal") && (
                <TableCell className="text-right font-mono text-xs">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn("cursor-help", r.endingBalance > 0 ? "font-bold text-red-600" : r.endingBalance < 0 ? "font-bold text-emerald-600" : "text-slate-500")}>
                        {r.endingBalance > 0 ? `+${r.endingBalance}` : r.endingBalance}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-[11px]">
                      <div className="space-y-1">
                        <div>GNR Qty: {r.gnrQty}</div>
                        <div>− Sales: {r.salesQty}</div>
                        <div>+ Returns: {r.returnQty}</div>
                        <div>− Removals: {r.removalQty}</div>
                        <div>− Reimb: {r.reimbQty}</div>
                        <div className="border-t border-slate-600 pt-1"><b>= {r.endingBalance}</b></div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                )}
                {show("fba_bal") && (
                <TableCell className="text-right font-mono text-xs">
                  {r.fbaEnding !== null ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn("cursor-help", r.fbaEnding > 0 ? "text-emerald-700 font-semibold" : r.fbaEnding < 0 ? "text-red-600 font-semibold" : "text-slate-500")}>
                          {r.fbaEnding}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[11px]">
                        <div className="space-y-1">
                          <div><b>FBA Balance:</b> {r.fbaEnding}</div>
                          <div><b>Calc Balance:</b> {r.endingBalance}</div>
                          <div><b>Gap:</b> {r.fbaEnding - r.endingBalance}</div>
                          {r.fbaSummaryDate ? <div><b>As of:</b> {r.fbaSummaryDate}</div> : null}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-[10px] text-slate-400">No data</span>
                  )}
                </TableCell>
                )}
                {show("status") && (
                  <TableCell>
                    <GnrStatusBadge status={r.actionStatus} />
                  </TableCell>
                )}
                {show("remarks") && (
                  <TableCell>
                    {onSaveRemark ? (
                      <RemarksCell
                        value={remarks?.[`${r.usedMsku}|${r.usedFnsku}`] ?? ""}
                        onSave={(next) =>
                          onSaveRemark(r.usedMsku, r.usedFnsku, next)
                        }
                      />
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
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

export const GNR_ANALYSIS_COLUMNS = [
  { id: "used_msku", label: "Used MSKU", align: "left" as const },
  { id: "used_fnsku", label: "Used FNSKU", align: "left" as const },
  { id: "orig_fnsku", label: "Orig. FNSKU", align: "left" as const },
  { id: "asin", label: "ASIN", align: "left" as const },
  { id: "condition", label: "Condition", align: "left" as const },
  { id: "gnr_qty", label: "GNR Qty", align: "right" as const },
  { id: "sales_qty", label: "Sales", align: "right" as const },
  { id: "return_qty", label: "Returns", align: "right" as const },
  { id: "removal_qty", label: "Removals", align: "right" as const },
  { id: "reimb_qty", label: "Reimb.", align: "right" as const },
  { id: "ending_bal", label: "Ending Bal.", align: "right" as const },
  { id: "fba_bal", label: "FBA Bal.", align: "right" as const },
  { id: "status", label: "Status", align: "left" as const },
  { id: "remarks", label: "Remarks", align: "left" as const },
  { id: "actions", label: "Actions", align: "left" as const },
];

function Actions({
  row,
  onRaiseCase,
  onAdjust,
}: {
  row: GnrReconRow;
  onRaiseCase: (row: GnrReconRow) => void;
  onAdjust: (row: GnrReconRow) => void;
}) {
  if (row.actionStatus === "matched" || row.actionStatus === "balanced") {
    return <span className="text-[10px] text-slate-400">—</span>;
  }
  if (row.actionStatus === "over-accounted") {
    return <span className="text-[10px] text-purple-700">Monitor</span>;
  }
  if (row.actionStatus === "review") {
    return <span className="text-[10px] text-pink-700">Check Data</span>;
  }
  const showRaise = row.caseCount === 0;
  return (
    <div className="flex gap-1">
      {row.caseCount > 0 ? (
        <span className="flex h-6 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 text-[10px] font-bold text-slate-700">
          ⚖️ {row.caseTopStatus || "Case"}
        </span>
      ) : showRaise ? (
        <button
          type="button"
          onClick={() => onRaiseCase(row)}
          className="flex h-6 items-center gap-1 rounded bg-amber-500 px-2 text-[10px] font-bold text-white hover:bg-amber-600"
          title="Raise Case"
        >
          <ScrollText className="size-3" aria-hidden /> Case
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onAdjust(row)}
        className="flex h-6 items-center gap-1 rounded bg-blue-600 px-2 text-[10px] font-bold text-white hover:bg-blue-700"
        title="Manual Adjustment"
      >
        <Wrench className="size-3" aria-hidden /> Adj
      </button>
    </div>
  );
}
