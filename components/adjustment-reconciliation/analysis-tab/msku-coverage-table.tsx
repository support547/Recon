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
import { Pagination } from "@/components/shared/Pagination";
import { AdjStatusBadge } from "@/components/adjustment-reconciliation/shared/status-badge";
import { cn } from "@/lib/utils";
import type { AdjAnalysisRow } from "@/lib/adjustment-reconciliation/types";

const DEADLINE_WARN_DAYS = 14;

export function MskuCoverageTable({
  rows,
  onCase,
  onAdjust,
}: {
  rows: AdjAnalysisRow[];
  onCase?: (row: AdjAnalysisRow) => void;
  onAdjust?: (row: AdjAnalysisRow) => void;
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  React.useEffect(() => {
    setPage(1);
  }, [rows]);

  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">✓</span>
        <p className="text-sm font-semibold text-foreground">No adjustment activity</p>
        <p className="text-xs">Upload Adjustments report to see MSKU coverage</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
            <TableRow>
              <Th>MSKU</Th>
              <Th>FNSKU</Th>
              <Th>ASIN</Th>
              <Th>Title</Th>
              <Th className="text-right">Loss Qty</Th>
              <Th className="text-right">Amazon Reimb</Th>
              <Th className="text-right">Net Claimable</Th>
              <Th>Claim Deadline</Th>
              <Th>Status</Th>
              <Th className="text-center">Action</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.map((r) => {
              const rowBg =
                r.actionStatus === "take-action"
                  ? "bg-red-50/40"
                  : r.actionStatus === "expired"
                    ? "bg-slate-50"
                    : r.actionStatus === "excess"
                      ? "bg-blue-50/30"
                      : "";
              return (
                <TableRow key={`${r.msku}|${r.fnsku}`} className={cn("hover:bg-slate-50", rowBg)}>
                  <TableCell className="font-mono text-[11px] font-semibold">{r.msku || "—"}</TableCell>
                  <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">{r.asin || "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-[11px]" title={r.title}>
                    {r.title || "—"}
                  </TableCell>

                  {/* Loss Qty: M/E sub-split, struck-through found offset, inbound-lost note. */}
                  <TableCell className="text-right font-mono text-[11px]">
                    <div className="flex flex-col items-end leading-tight">
                      <span>
                        <span className="text-orange-700 font-bold">L:{r.misplacedQty - r.inboundLostQty}</span>
                        <span className="mx-1 text-slate-300">·</span>
                        <span className="text-purple-700 font-bold">D:{r.damagedQty}</span>
                      </span>
                      {r.foundQty > 0 ? (
                        <span className="text-[9px] text-emerald-600 line-through" title="Found offsets Lost first">
                          F:{r.foundQty}
                        </span>
                      ) : null}
                      {r.inboundLostQty > 0 ? (
                        <span
                          className="text-[9px] text-slate-400"
                          title="Inbound lost (code 5) — Shipment Recon scope"
                        >
                          ↪ Inb:{r.inboundLostQty}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>

                  {/* Amazon Reimb badge: per-bucket tooltip. */}
                  <TableCell className="text-right">
                    {r.lostReimbQty + r.damagedReimbQty > 0 ? (
                      <Badge
                        variant="outline"
                        className="rounded-full border-emerald-200 bg-emerald-50 font-mono text-[10px] font-bold text-emerald-700"
                        title={`Lost: ${r.lostReimbQty}/${r.misplacedQty - r.inboundLostQty} · Damaged: ${r.damagedReimbQty}/${r.damagedQty}`}
                      >
                        ✓ {r.lostReimbQty + r.damagedReimbQty}
                      </Badge>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-300">—</span>
                    )}
                  </TableCell>

                  <TableCell
                    className={cn(
                      "text-right font-mono text-[11px] font-bold",
                      r.netClaimableQty > 0 ? "text-red-600" : "text-muted-foreground",
                    )}
                  >
                    {r.netClaimableQty || "—"}
                  </TableCell>

                  {/* Claim Deadline. */}
                  <TableCell className="font-mono text-[11px]">
                    <DeadlineCell row={r} />
                  </TableCell>

                  <TableCell>
                    <AdjStatusBadge status={r.actionStatus} />
                  </TableCell>

                  {/* Action. */}
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      {r.actionStatus === "expired" ? (
                        <span
                          className="flex h-6 cursor-not-allowed items-center gap-1 rounded bg-slate-200 px-2 text-[10px] font-bold text-slate-400"
                          title="Manual claim window closed — claim ineligible"
                        >
                          Window closed
                        </span>
                      ) : r.actionStatus === "take-action" ? (
                        <button
                          type="button"
                          onClick={() => onCase?.(r)}
                          className="flex h-6 items-center gap-1 rounded bg-amber-500 px-2 text-[10px] font-bold text-white hover:bg-amber-600"
                          title={`Raise Case — ${r.daysToDeadline} day${r.daysToDeadline === 1 ? "" : "s"} to deadline`}
                        >
                          <ScrollText className="size-3" aria-hidden /> Raise Case
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onAdjust?.(r)}
                        className="flex h-6 items-center gap-1 rounded bg-blue-600 px-2 text-[10px] font-bold text-white hover:bg-blue-700"
                        title="Manual Adjustment / Reimbursement"
                      >
                        <Wrench className="size-3" aria-hidden /> Adjust
                      </button>
                    </div>
                  </TableCell>
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

function DeadlineCell({ row }: { row: AdjAnalysisRow }) {
  if (!row.claimDeadline) {
    return <span className="text-slate-300">—</span>;
  }
  if (row.daysToDeadline < 0) {
    return <span className="font-bold text-slate-400 line-through">EXPIRED</span>;
  }
  const urgent = row.daysToDeadline <= DEADLINE_WARN_DAYS;
  return (
    <span
      className={cn(urgent ? "font-bold text-red-600" : "text-slate-600")}
      title={`${row.daysToDeadline} day${row.daysToDeadline === 1 ? "" : "s"} left`}
    >
      {row.claimDeadline}
    </span>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(
        "h-11 whitespace-nowrap px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700",
        className,
      )}
    >
      {children}
    </TableHead>
  );
}
