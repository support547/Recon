"use client";

import * as React from "react";
import { ScrollText, Wrench, Search } from "lucide-react";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared/Pagination";
import { cn } from "@/lib/utils";
import { FullStatusBadge } from "@/components/fc-transfer-reconciliation/full-recon-tab/full-status-badge";
import type { FcFullReconRow } from "@/lib/fc-transfer-reconciliation/full-recon-types";
import { AsinLink } from "@/components/shared/asin-link";
import type { Marketplace } from "@/lib/branding/marketplaces";

export function FullReconTable({
  rows,
  onRaiseCase,
  onAdjust,
  onDrill,
  visibility,
  marketplace = null,
}: {
  rows: FcFullReconRow[];
  onRaiseCase: (row: FcFullReconRow) => void;
  onAdjust: (row: FcFullReconRow) => void;
  onDrill: (row: FcFullReconRow) => void;
  visibility?: Record<string, boolean>;
  marketplace?: Marketplace | null;
}) {
  const show = (id: string) => visibility?.[id] !== false;
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  React.useEffect(() => {
    setPage(1);
  }, [rows]);
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">✓</span>
        <p className="text-sm font-semibold text-foreground">Nothing to reconcile</p>
        <p className="text-xs">No FC transfer groups match the current filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
            <TableRow>
              {FC_FULL_COLUMNS.filter((c) => show(c.id)).map((c) => (
                <TableHead
                  key={c.id}
                  className={cn(
                    "h-11 whitespace-nowrap px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700",
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
                r.status === "DAMAGED_IN_TRANSIT" || r.status === "SHORTAGE_AND_DAMAGED"
                  ? "bg-rose-50/50"
                  : r.status === "SHORTAGE"
                    ? "bg-red-50/40"
                    : r.status === "EXCESS"
                      ? "bg-blue-50/30"
                      : "";
              const netCls =
                r.netQty > 0 ? "text-emerald-700" : r.netQty < 0 ? "text-red-600" : "text-muted-foreground";
              const netStr = (r.netQty > 0 ? "+" : "") + r.netQty;
              // Color hint aligned with the 55-day SHORTAGE boundary.
              const daysCls =
                r.daysPending > 55
                  ? "text-red-600 font-bold"
                  : r.daysPending > 30
                    ? "text-amber-700 font-bold"
                    : "text-emerald-700 font-semibold";
              return (
                <TableRow
                  key={`${r.msku}|${r.fnsku}|${r.asin}`}
                  className={cn("hover:bg-slate-50", rowBg)}
                >
                  {show("msku") && <TableCell className="font-mono text-[11px] font-semibold">{r.msku || "—"}</TableCell>}
                  {show("fnsku") && <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>}
                  {show("asin") && (
                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                      <AsinLink asin={r.asin} marketplace={marketplace} />
                    </TableCell>
                  )}
                  {show("title") && (
                    <TableCell className="max-w-[140px] truncate text-[10px]" title={r.title}>
                      {r.title || "—"}
                    </TableCell>
                  )}
                  {show("fcs") && (
                    <TableCell className="whitespace-nowrap text-[10px] text-muted-foreground">
                      {r.fromFcCount || r.toFcCount ? (
                        <span className="font-mono" title="Distinct OUT FCs / IN FCs (full list in Logs)">
                          Out {r.fromFcCount}<span className="text-slate-400"> / </span>In {r.toFcCount}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  )}
                  {show("out") && (
                    <TableCell className="text-right font-mono text-[11px]">
                      <span className="font-bold text-red-600">-{r.outQty}</span>
                      <span className="ml-1 text-[9px] text-muted-foreground">S{r.outSellable}/U{r.outUnsellable}</span>
                    </TableCell>
                  )}
                  {show("in") && (
                    <TableCell className="text-right font-mono text-[11px]">
                      <span className="font-bold text-emerald-700">+{r.inQty}</span>
                      <span className="ml-1 text-[9px] text-muted-foreground">S{r.inSellable}/U{r.inUnsellable}</span>
                    </TableCell>
                  )}
                  {show("net") && <TableCell className={cn("text-right font-mono text-xs font-bold", netCls)}>{netStr}</TableCell>}
                  {show("shortfall") && (
                    <TableCell className="text-right font-mono text-xs">
                      {r.sellableShortfall > 0 ? <b className="text-red-600">{r.sellableShortfall}</b> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                  {show("degradation") && (
                    <TableCell className="text-right font-mono text-xs">
                      {r.degradationQty > 0 ? <b className="text-rose-700">{r.degradationQty}</b> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                  {show("intransit") && (
                    <TableCell className="text-right font-mono text-xs">
                      {r.inTransitPending > 0 ? <b className="text-sky-700">{r.inTransitPending}</b> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                  {show("days") && <TableCell className={cn("text-right text-[11px]", daysCls)}>{r.daysPending}d</TableCell>}
                  {show("status") && (
                    <TableCell>
                      <FullStatusBadge status={r.status} />
                    </TableCell>
                  )}
                  {show("action") && (
                    <TableCell>
                      <Actions row={r} onRaiseCase={onRaiseCase} onAdjust={onAdjust} onDrill={onDrill} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        totalRows={rows.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />
    </div>
  );
}

export const FC_FULL_COLUMNS = [
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "fnsku", label: "FNSKU", align: "left" as const },
  { id: "asin", label: "ASIN", align: "left" as const },
  { id: "title", label: "Title", align: "left" as const },
  { id: "fcs", label: "FCs (Out/In)", align: "left" as const },
  { id: "out", label: "OUT (T/S/U)", align: "right" as const },
  { id: "in", label: "IN (T/S/U)", align: "right" as const },
  { id: "net", label: "Net", align: "right" as const },
  { id: "shortfall", label: "Shortfall", align: "right" as const },
  { id: "degradation", label: "Degrade", align: "right" as const },
  { id: "intransit", label: "Transit", align: "right" as const },
  { id: "days", label: "Days Pending", align: "right" as const },
  { id: "status", label: "Status", align: "left" as const },
  { id: "action", label: "Action", align: "left" as const },
];

function Actions({
  row,
  onRaiseCase,
  onAdjust,
  onDrill,
}: {
  row: FcFullReconRow;
  onRaiseCase: (row: FcFullReconRow) => void;
  onAdjust: (row: FcFullReconRow) => void;
  onDrill: (row: FcFullReconRow) => void;
}) {
  const drillBtn = (
    <button
      type="button"
      onClick={() => onDrill(row)}
      className="flex h-6 items-center gap-1 rounded bg-slate-700 px-2 text-[10px] font-bold text-white hover:bg-slate-800"
      title="View transfer logs"
    >
      <Search className="size-3" aria-hidden /> Logs
    </button>
  );

  // Non-actionable rows (reconciled, excess, in-transit, settled, case-open):
  // drill-down only.
  if (!row.actionable) {
    return (
      <div className="flex items-center gap-1">
        {drillBtn}
        <span className="text-[10px] text-muted-foreground">
          {row.status === "EXCESS" ? "Monitor" : row.status === "IN_TRANSIT" ? "Wait" : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {drillBtn}
      {row.caseCount > 0 ? (
        <span className="flex h-6 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700">
          ⚖️ {row.caseCount}
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
