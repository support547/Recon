"use client";

import * as React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  CellHoverPopover,
  CellHoverRow,
} from "@/components/shared/cell-hover-popover";
import { RemarksCell } from "@/components/shared/remarks-cell";
import { cn } from "@/lib/utils";
import { FullStatusBadge } from "@/components/full-reconciliation/shared/status-badge";
import type { FullReconRow } from "@/lib/full-reconciliation/types";

type RemarkSaveResult = { ok: true } | { ok: false; error: string };

export type ColKey =
  | "shippedQty" | "receiptQty" | "shortageQty" | "soldQty"
  | "returnQty" | "reimbQty" | "removalRcptQty" | "replQty"
  | "gnrQty" | "fcNetQty" | "endingBalance" | "fbaEndingBalance"
  | "fbaAdjTotal" | "adjQty";

const COLS: { key: ColKey; label: string }[] = [
  { key: "shippedQty", label: "Shipped" },
  { key: "receiptQty", label: "Receipts" },
  { key: "shortageQty", label: "Shortage" },
  { key: "soldQty", label: "Sold" },
  { key: "returnQty", label: "Returns" },
  { key: "reimbQty", label: "Reimb." },
  { key: "removalRcptQty", label: "Removal Rcpt" },
  { key: "replQty", label: "Replacements" },
  { key: "gnrQty", label: "GNR Qty" },
  { key: "fcNetQty", label: "FC Transfer" },
  { key: "endingBalance", label: "Ending Bal." },
  { key: "fbaEndingBalance", label: "FBA Bal." },
  { key: "fbaAdjTotal", label: "Adjustments" },
  { key: "adjQty", label: "Manual Adj" },
];

export function FullReconTable({
  rows,
  colFilters,
  onToggleCol,
  onOpenDetail,
  onOpenAction,
  remarks,
  onSaveRemark,
}: {
  rows: FullReconRow[];
  colFilters: Set<ColKey>;
  onToggleCol: (k: ColKey) => void;
  onOpenDetail: (row: FullReconRow) => void;
  onOpenAction: (row: FullReconRow) => void;
  remarks?: Record<string, string>;
  onSaveRemark?: (fnsku: string, next: string) => Promise<RemarkSaveResult>;
}) {
  const colTotals = React.useMemo(() => {
    const t: Record<ColKey, number> = {
      shippedQty: 0, receiptQty: 0, shortageQty: 0, soldQty: 0,
      returnQty: 0, reimbQty: 0, removalRcptQty: 0, replQty: 0,
      gnrQty: 0, fcNetQty: 0, endingBalance: 0, fbaEndingBalance: 0,
      fbaAdjTotal: 0, adjQty: 0,
    };
    for (const r of rows) {
      t.shippedQty += r.shippedQty;
      t.receiptQty += r.receiptQty;
      t.shortageQty += r.shortageQty;
      t.soldQty += r.soldQty;
      t.returnQty += r.returnQty;
      t.reimbQty += r.reimbQty;
      t.removalRcptQty += r.removalRcptQty;
      t.replQty += r.replQty;
      t.gnrQty += r.gnrQty;
      t.fcNetQty += r.fcNetQty;
      t.endingBalance += r.endingBalance;
      t.fbaEndingBalance += r.fbaEndingBalance ?? 0;
      t.fbaAdjTotal += r.fbaAdjTotal;
      t.adjQty += r.adjQty;
    }
    return t;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">📊</span>
        <p className="text-sm font-semibold text-foreground">No FNSKUs match filters</p>
        <p className="text-xs">Upload reports or adjust filters</p>
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] overflow-auto rounded-md border border-slate-200 bg-white">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
          <TableRow>
            <TableHead className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              MSKU / Title
            </TableHead>
            <TableHead className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              ASIN
            </TableHead>
            <TableHead className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              FNSKU
            </TableHead>
            <TableHead className="whitespace-nowrap text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Days
            </TableHead>
            {COLS.map((c) => (
              <TableHead
                key={c.key}
                className="whitespace-nowrap text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
              >
                <div className="flex flex-col items-end">
                  <span>{c.label}</span>
                  <button
                    type="button"
                    onClick={() => onToggleCol(c.key)}
                    className={cn(
                      "mt-0.5 font-mono text-[9px] font-bold transition",
                      colFilters.has(c.key)
                        ? "rounded bg-blue-600 px-1.5 text-white"
                        : "rounded px-1 text-blue-600 hover:bg-blue-50",
                    )}
                    title="Click to filter non-zero only"
                  >
                    {colTotals[c.key] >= 0 ? "+" : ""}{colTotals[c.key].toLocaleString()}
                  </button>
                </div>
              </TableHead>
            ))}
            <TableHead className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Remarks
            </TableHead>
            <TableHead className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <RowItem
              key={r.fnsku}
              row={r}
              onOpenDetail={onOpenDetail}
              onOpenAction={onOpenAction}
              remark={remarks?.[r.fnsku] ?? ""}
              onSaveRemark={onSaveRemark}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RowItem({
  row,
  onOpenDetail,
  onOpenAction,
  remark,
  onSaveRemark,
}: {
  row: FullReconRow;
  onOpenDetail: (row: FullReconRow) => void;
  onOpenAction: (row: FullReconRow) => void;
  remark: string;
  onSaveRemark?: (fnsku: string, next: string) => Promise<RemarkSaveResult>;
}) {
  const shortageCls = row.shortageQty > 0 ? "text-red-600 font-bold" : row.shortageQty < 0 ? "text-amber-600 font-bold" : "text-emerald-600";
  return (
    <TableRow className="hover:bg-slate-50">
      <TableCell>
        <button
          type="button"
          onClick={() => onOpenDetail(row)}
          className="block max-w-[200px] cursor-pointer text-left"
        >
          <div className="truncate font-mono text-[11px] font-semibold text-blue-600 underline-offset-2 hover:underline">
            {row.msku || "—"}
          </div>
          <div className="truncate text-[10px] text-muted-foreground" title={row.title}>
            {row.title || ""}
          </div>
        </button>
      </TableCell>
      <TableCell className="font-mono text-[10px]">{row.asin || "—"}</TableCell>
      <TableCell className="font-mono text-[10px]">{row.fnsku || "—"}</TableCell>
      <TableCell className="text-right">
        {row.daysRecvToSale !== null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help font-mono text-[11px] font-semibold text-blue-600">
                {row.daysRecvToSale}d
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">
              <div><b>Last Recv:</b> {row.latestRecvDate || "—"}</div>
              <div><b>Last Sale:</b> {row.latestSaleDate || "—"}</div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-xs font-semibold">
        <ShippedCell row={row} />
      </TableCell>
      <TableCell className="text-right font-mono text-xs">{nz(row.receiptQty)}</TableCell>
      <TableCell className={cn("text-right font-mono text-xs", shortageCls)}>
        {row.shortageQty === 0 ? "0" : row.shortageQty}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-red-500">
        {row.soldQty ? `−${row.soldQty}` : <span className="text-slate-400">—</span>}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-emerald-600">
        <ReturnCell row={row} />
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-red-600">
        <ReimbCell row={row} />
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-red-600">
        <RemovalCell row={row} />
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        <ReplCell row={row} />
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-red-600">
        <GnrCell row={row} />
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        <FcCell row={row} />
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        <EndingBalCell row={row} />
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        <FbaBalCell row={row} />
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        <FbaAdjCell row={row} />
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        <ManualAdjCell row={row} />
      </TableCell>
      <TableCell>
        <FullStatusBadge status={row.reconStatus} />
      </TableCell>
      <TableCell>
        {onSaveRemark ? (
          <RemarksCell
            value={remark}
            onSave={(next) => onSaveRemark(row.fnsku, next)}
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenAction(row)}
          className="h-6 px-2 text-[10px]"
        >
          + Action
        </Button>
      </TableCell>
    </TableRow>
  );
}

function nz(v: number) {
  if (v === 0) return <span className="text-slate-400">—</span>;
  return v.toLocaleString();
}

function ShippedCell({ row }: { row: FullReconRow }) {
  if (!row.shipmentDetails.length) {
    return <span>{row.shippedQty.toLocaleString()}</span>;
  }
  return (
    <CellHoverPopover
      trigger={row.shippedQty.toLocaleString()}
      title="Shipments"
      count={row.shipmentDetails.length}
      width={420}
    >
      {row.shipmentDetails.map((s, i) => (
        <div
          key={i}
          className="border-b border-border/60 px-2 py-1 last:border-b-0"
        >
          <div className="flex justify-between gap-2">
            <span className="font-mono">{s.shipmentId || "—"}</span>
            <span className="font-mono tabular-nums">{s.qty}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {s.shipDate} · {s.status}
            {s.receiptDate ? ` · ✓ ${s.receiptDate}` : " · pending"}
          </div>
        </div>
      ))}
    </CellHoverPopover>
  );
}

function ReturnCell({ row }: { row: FullReconRow }) {
  if (row.returnQty === 0) return <span className="text-slate-400">—</span>;
  return (
    <CellHoverPopover
      trigger={<span className="font-bold">+{row.returnQty}</span>}
      title="Returns"
      count={row.returnDetails.length}
      triggerClassName="text-emerald-600"
    >
      {row.returnDetails.map((d, i) => (
        <div
          key={i}
          className="border-b border-border/60 px-2 py-1 last:border-b-0"
        >
          <div className="flex justify-between gap-2">
            <span>Qty {d.qty}</span>
            <span className="text-muted-foreground">{d.status}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {d.disp} · {d.reason}
            {d.orders ? ` · ${d.orders}` : ""}
          </div>
        </div>
      ))}
    </CellHoverPopover>
  );
}

function ReimbCell({ row }: { row: FullReconRow }) {
  if (row.reimbQty === 0 && row.reimbAmt === 0)
    return <span className="text-slate-400">—</span>;
  return (
    <CellHoverPopover
      trigger={
        <span className="font-bold">
          −{row.reimbQty}
          {row.reimbAmt > 0 ? (
            <span className="ml-1 text-[9px] text-emerald-600">
              ${row.reimbAmt.toFixed(2)}
            </span>
          ) : null}
        </span>
      }
      title="Reimbursements (Lost/Damaged)"
      count={row.reimbDetails.length}
      triggerClassName="text-red-600"
      width={420}
    >
      {row.reimbDetails.map((d, i) => (
        <div
          key={i}
          className="border-b border-border/60 px-2 py-1 last:border-b-0"
        >
          <div className="flex justify-between gap-2">
            <span>Qty {d.qty}</span>
            <span className="text-emerald-600">${d.amount.toFixed(2)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {d.reason}
            {d.orderId && d.orderId !== "—" ? ` · ${d.orderId}` : ""}
            {d.caseId && d.caseId !== "—" ? ` · case ${d.caseId}` : ""}
          </div>
        </div>
      ))}
    </CellHoverPopover>
  );
}

function RemovalCell({ row }: { row: FullReconRow }) {
  if (row.removalRcptQty === 0)
    return <span className="text-slate-400">—</span>;
  return (
    <CellHoverPopover
      trigger={<span className="font-bold">−{row.removalRcptQty}</span>}
      title="Removal Receipts"
      count={row.removalRcptDetails.length}
      triggerClassName="text-red-600"
      width={420}
    >
      {row.removalRcptDetails.map((d, i) => (
        <div
          key={i}
          className="border-b border-border/60 px-2 py-1 last:border-b-0"
        >
          <div className="flex justify-between gap-2">
            <span className="font-mono">
              {d.orderId === "—" ? "—" : d.orderId}
            </span>
            <span className="font-mono tabular-nums">{d.qty}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {d.date || "—"} · ✓ {d.sellable} sellable
            {d.unsellable > 0 ? ` · ✕ ${d.unsellable} unsellable` : ""}
            {d.status && d.status !== "—" ? ` · ${d.status}` : ""}
          </div>
        </div>
      ))}
    </CellHoverPopover>
  );
}

function ReplCell({ row }: { row: FullReconRow }) {
  if (row.replQty === 0) return <span className="text-slate-400">—</span>;
  if (row.replReturnQty === 0 && row.replReimbQty === 0) return <span className="text-slate-400">—</span>;
  const display = row.replReturnQty > 0
    ? <span className="font-bold text-emerald-600">+{row.replReturnQty}</span>
    : <span className="font-bold text-red-600">−{row.replReimbQty}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help">{display}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        <div className="space-y-0.5">
          <div><b>Replaced:</b> −{row.replQty}</div>
          <div><b>Returns:</b> +{row.replReturnQty}</div>
          <div><b>Reimb:</b> −{row.replReimbQty}{row.replReimbAmt > 0 ? ` · $${row.replReimbAmt.toFixed(2)}` : ""}</div>
          <div><b>Status:</b> {row.replStatus}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function GnrCell({ row }: { row: FullReconRow }) {
  if (row.gnrQty === 0) return <span className="text-slate-400">—</span>;
  return (
    <CellHoverPopover
      trigger={<span className="font-bold">−{row.gnrQty}</span>}
      title="Grade & Resell"
      count={row.gnrDetails.length}
      triggerClassName="text-red-600"
      width={420}
    >
      <div className="border-b border-border/60 bg-muted/40 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
        Total: {row.gnrQty} ·{" "}
        <span className="text-emerald-600">{row.gnrSucceeded} ok</span>
        {row.gnrFailed > 0 ? (
          <span className="ml-1 text-red-600">· {row.gnrFailed} fail</span>
        ) : null}
      </div>
      {row.gnrDetails.map((d, i) => (
        <div
          key={i}
          className="border-b border-border/60 px-2 py-1 last:border-b-0"
        >
          <div className="flex justify-between gap-2">
            <span className="font-mono">{d.usedMsku}</span>
            <span className="font-mono tabular-nums">{d.qty}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {d.condition}
            {d.succeeded > 0 ? ` · ✓ ${d.succeeded}` : ""}
            {d.failed > 0 ? ` · ✕ ${d.failed}` : ""}
          </div>
        </div>
      ))}
    </CellHoverPopover>
  );
}

function FcCell({ row }: { row: FullReconRow }) {
  if (row.fcNetQty === 0 && row.fcEventDays === 0) return <span className="text-slate-400">—</span>;
  const cls = row.fcNetQty > 0 ? "text-blue-600 font-bold" : row.fcNetQty < 0 ? "text-amber-600 font-bold" : "text-emerald-600 font-bold";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("cursor-help", cls)}>
          {row.fcNetQty > 0 ? `+${row.fcNetQty}` : row.fcNetQty}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        <div><b>Net:</b> {row.fcNetQty > 0 ? `+${row.fcNetQty}` : row.fcNetQty}</div>
        <div><b>IN:</b> {row.fcInQty} · <b>OUT:</b> {row.fcOutQty}</div>
        <div><b>Event days:</b> {row.fcEventDays}</div>
        <div><b>Period:</b> {row.fcEarliestDate} → {row.fcLatestDate}</div>
        <div><b>Days pending:</b> {row.fcDaysPending}</div>
        <div><b>Status:</b> {row.fcStatus}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function EndingBalCell({ row }: { row: FullReconRow }) {
  if (row.endingBalance === 0) return <span className="text-slate-400">0</span>;
  const cls = row.endingBalance > 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("cursor-help", cls)}>
          {row.endingBalance > 0 ? `+${row.endingBalance}` : row.endingBalance}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        <div className="space-y-0.5">
          <div>Receipts: <b className="text-emerald-300">+{row.receiptQty}</b></div>
          <div>Sold: <b className="text-red-300">−{row.soldQty}</b></div>
          <div>Returns: <b className="text-emerald-300">+{row.returnQty}</b></div>
          <div>Reimb: <b className="text-red-300">−{row.reimbQty}</b></div>
          <div>Removal Rcpt: <b className="text-red-300">−{row.removalRcptQty}</b></div>
          <div>Replacements: <b>{row.replReturnQty > 0 ? `+${row.replReturnQty}` : `−${row.replReimbQty}`}</b></div>
          <div>GNR: <b className="text-red-300">−{row.gnrQty}</b></div>
          <div>FC: <b>{row.fcNetQty > 0 ? `+${row.fcNetQty}` : row.fcNetQty}</b></div>
          <div className="border-t border-slate-700 pt-0.5"><b>= {row.endingBalance}</b></div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function FbaBalCell({ row }: { row: FullReconRow }) {
  if (row.fbaEndingBalance === null) return <span className="text-slate-400">—</span>;
  const v = row.fbaEndingBalance;
  const cls = v > 0 ? "text-emerald-600 font-bold" : v < 0 ? "text-red-600 font-bold" : "text-slate-400";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("cursor-help", cls)}>{v > 0 ? `+${v}` : v}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        <div><b>FBA Balance:</b> {v}</div>
        <div><b>Calc Balance:</b> {row.endingBalance}</div>
        <div><b>Gap:</b> {v - row.endingBalance}</div>
        <div><b>As of:</b> {row.fbaSummaryDate || "—"}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function FbaAdjCell({ row }: { row: FullReconRow }) {
  if (row.fbaAdjTotal === 0) return <span className="text-slate-400">—</span>;
  const cls = row.fbaAdjTotal > 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("cursor-help", cls)}>
          {row.fbaAdjTotal > 0 ? `+${row.fbaAdjTotal}` : row.fbaAdjTotal}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        <div><b>Vendor Returns:</b> {row.fbaVendorReturns}</div>
        <div><b>Found:</b> {row.fbaFound}</div>
        <div><b>Lost:</b> {row.fbaLost}</div>
        <div><b>Damaged:</b> {row.fbaDamaged}</div>
        <div><b>Disposed:</b> {row.fbaDisposed}</div>
        <div><b>Other:</b> {row.fbaOther}</div>
        <div><b>Unknown:</b> {row.fbaUnknown}</div>
        <div className="border-t border-slate-700 pt-0.5"><b>Total:</b> {row.fbaAdjTotal}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function ManualAdjCell({ row }: { row: FullReconRow }) {
  if (row.adjQty === 0) return <span className="text-slate-400">—</span>;
  const cls = row.adjQty > 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("cursor-help", cls)}>{row.adjQty > 0 ? `+${row.adjQty}` : row.adjQty}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        <div><b>Count:</b> {row.adjCount} entries</div>
        <div><b>Net Qty:</b> {row.adjQty}</div>
      </TooltipContent>
    </Tooltip>
  );
}
