"use client";

import { ScrollText, Wrench } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ActionStatusBadge,
} from "@/components/fc-transfer-reconciliation/shared/action-status-badge";
import { CellHoverPopover, CellHoverRow } from "@/components/shared/cell-hover-popover";
import type { FcAnalysisRow } from "@/lib/fc-transfer-reconciliation/types";

export function AnalysisTable({
  rows,
  onRaiseCase,
  onAdjust,
}: {
  rows: FcAnalysisRow[];
  onRaiseCase: (row: FcAnalysisRow) => void;
  onAdjust: (row: FcAnalysisRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">✓</span>
        <p className="text-sm font-semibold text-foreground">No unresolved FC transfers</p>
        <p className="text-xs">All transfers are balanced</p>
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
              r.actionStatus === "take-action"
                ? "bg-red-50/40"
                : r.actionStatus === "excess"
                  ? "bg-blue-50/30"
                  : "";
            const netCls =
              r.netQty > 0 ? "text-emerald-700" : r.netQty < 0 ? "text-red-600" : "text-muted-foreground";
            const netStr = (r.netQty > 0 ? "+" : "") + r.netQty;
            const daysCls =
              r.daysPending > 60 ? "text-red-600 font-bold" :
              r.daysPending > 30 ? "text-amber-700 font-bold" :
              "text-emerald-700 font-semibold";
            return (
              <TableRow key={`${r.msku}|${r.fnsku}`} className={cn("hover:bg-slate-50", rowBg)}>
                <TableCell className="font-mono text-[11px] font-semibold">{r.msku || "—"}</TableCell>
                <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>
                <TableCell className="font-mono text-[10px] text-muted-foreground">{r.asin || "—"}</TableCell>
                <TableCell className="max-w-[150px] truncate text-[10px]" title={r.title}>
                  {r.title || "—"}
                </TableCell>
                <TableCell className={cn("text-right font-mono text-xs font-bold", netCls)}>{netStr}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold text-emerald-700">
                  +{r.qtyIn}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold text-red-600">
                  -{r.qtyOut}
                </TableCell>
                <TableCell className="text-right text-[11px] text-muted-foreground">{r.eventDays}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                  {r.earliestDate || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-[10px] font-semibold">
                  {r.imbalanceStart || "—"}
                </TableCell>
                <TableCell className={cn("text-right text-[11px]", daysCls)}>{r.daysPending}d</TableCell>
                <TableCell>
                  <ActionStatusBadge status={r.actionStatus} />
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {r.effectiveReimbQty > 0 ? (
                    <b className="text-emerald-700">{r.effectiveReimbQty}</b>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {r.caseApprovedAmount > 0 ? (
                    <CellHoverPopover
                      title="Reimbursement details"
                      side="left"
                      width={300}
                      trigger={
                        <b className="text-emerald-700">${r.caseApprovedAmount.toFixed(2)}</b>
                      }
                    >
                      {r.caseCount > 0 ? (
                        <CellHoverRow
                          left="Case Count"
                          right={`${r.caseCount} case${r.caseCount > 1 ? "s" : ""}`}
                        />
                      ) : null}
                      {r.caseStatusTop ? (
                        <CellHoverRow left="Top Status" right={r.caseStatusTop} />
                      ) : null}
                      <CellHoverRow
                        left="Approved Qty (Case)"
                        right={r.caseApprovedQty}
                      />
                      <CellHoverRow
                        left="Approved Amt (Case)"
                        right={`$${r.caseApprovedAmount.toFixed(2)}`}
                      />
                      {r.adjQty ? (
                        <CellHoverRow left="Manual Adj Qty" right={r.adjQty} />
                      ) : null}
                      <CellHoverRow
                        left="Effective Reimb Qty"
                        right={r.effectiveReimbQty}
                      />
                    </CellHoverPopover>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
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
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "fnsku", label: "FNSKU", align: "left" as const },
  { id: "asin", label: "ASIN", align: "left" as const },
  { id: "title", label: "Title", align: "left" as const },
  { id: "net", label: "Net Qty", align: "right" as const },
  { id: "in", label: "Qty In (+)", align: "right" as const },
  { id: "out", label: "Qty Out (−)", align: "right" as const },
  { id: "events", label: "Events", align: "right" as const },
  { id: "first", label: "First Event", align: "left" as const },
  { id: "imb", label: "Imbalance Since", align: "left" as const },
  { id: "days", label: "Days Pending", align: "right" as const },
  { id: "status", label: "Status", align: "left" as const },
  { id: "rimbqty", label: "Reimb. Qty", align: "right" as const },
  { id: "rimbamt", label: "Reimb. $", align: "right" as const },
  { id: "action", label: "Action", align: "left" as const },
];

function Actions({
  row,
  onRaiseCase,
  onAdjust,
}: {
  row: FcAnalysisRow;
  onRaiseCase: (row: FcAnalysisRow) => void;
  onAdjust: (row: FcAnalysisRow) => void;
}) {
  if (row.actionStatus === "excess") {
    return <span className="text-[10px] text-muted-foreground">— Monitor</span>;
  }
  return (
    <div className="flex gap-1">
      {row.caseCount > 0 ? (
        <span className="flex h-6 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700">
          ⚖️ {row.caseCount} Case{row.caseCount > 1 ? "s" : ""}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onRaiseCase(row)}
          className="flex h-6 items-center gap-1 rounded bg-amber-500 px-2 text-[10px] font-bold text-white hover:bg-amber-600"
          title="Raise Case"
        >
          <ScrollText className="size-3" aria-hidden /> Case
        </button>
      )}
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
