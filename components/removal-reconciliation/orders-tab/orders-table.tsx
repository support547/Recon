"use client";

import * as React from "react";
import { ChevronRight, Lock, Package, ScrollText, Unlock } from "lucide-react";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  CellHoverPopover,
  CellHoverRow,
} from "@/components/shared/cell-hover-popover";
import {
  RemovalStatusBadge,
  WrongItemBadge,
} from "@/components/removal-reconciliation/shared/status-badge";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/shared/Pagination";
import type { RemovalReconRow, TrackingDetail } from "@/lib/removal-reconciliation/types";

type OrderTrackingAgg = { tracking: string; count: number; fee: number };

export type RemovalColTotalKey =
  | "requestedQty"
  | "actualShipped"
  | "receivedQty"
  | "reimbQty"
  | "reimbAmount"
  | "removalFee";

export function OrdersTable({
  rows,
  onReceive,
  onRaiseCase,
  onUnlock,
  colTotalFilter,
  onToggleColTotal,
  visibility,
}: {
  rows: RemovalReconRow[];
  onReceive: (row: RemovalReconRow) => void;
  /** Creates CaseTracker REMOVAL row (Cases & Adjustments). */
  onRaiseCase: (row: RemovalReconRow) => void;
  onUnlock: (row: RemovalReconRow) => void;
  colTotalFilter?: RemovalColTotalKey | null;
  onToggleColTotal?: (k: RemovalColTotalKey) => void;
  visibility?: Record<string, boolean>;
}) {
  const show = (id: string) => visibility?.[id] !== false;
  const totals = React.useMemo(() => {
    let requestedQty = 0;
    let actualShipped = 0;
    let receivedQty = 0;
    let reimbQty = 0;
    let reimbAmount = 0;
    let removalFee = 0;
    for (const r of rows) {
      requestedQty += r.requestedQty;
      actualShipped += r.actualShipped;
      receivedQty += r.receivedQty;
      reimbQty += r.reimbQty;
      reimbAmount += r.reimbAmount;
      removalFee += r.removalFee;
    }
    return { requestedQty, actualShipped, receivedQty, reimbQty, reimbAmount, removalFee };
  }, [rows]);

  // Per-order tracking breakdown: unique tracking # → line count + summed fee,
  // aggregated across every row sharing the same orderId.
  const orderTrackingMap = React.useMemo(() => {
    const map = new Map<string, OrderTrackingAgg[]>();
    const byOrder = new Map<string, Map<string, { count: number; fee: number }>>();
    for (const r of rows) {
      if (!r.orderId) continue;
      let trackMap = byOrder.get(r.orderId);
      if (!trackMap) {
        trackMap = new Map();
        byOrder.set(r.orderId, trackMap);
      }
      const trackings = (r.trackingNumbers || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      const keys = trackings.length > 0 ? trackings : ["—"];
      for (const t of keys) {
        const prev = trackMap.get(t) ?? { count: 0, fee: 0 };
        prev.count += 1;
        prev.fee += r.removalFee;
        trackMap.set(t, prev);
      }
    }
    for (const [orderId, trackMap] of byOrder) {
      const aggs = Array.from(trackMap, ([tracking, v]) => ({ tracking, ...v }));
      aggs.sort((a, b) => b.count - a.count || b.fee - a.fee);
      map.set(orderId, aggs);
    }
    return map;
  }, [rows]);

  const totalsMap: Record<RemovalColTotalKey, { value: number; currency?: boolean }> = {
    requestedQty: { value: totals.requestedQty },
    actualShipped: { value: totals.actualShipped },
    receivedQty: { value: totals.receivedQty },
    reimbQty: { value: totals.reimbQty },
    reimbAmount: { value: totals.reimbAmount, currency: true },
    removalFee: { value: totals.removalFee, currency: true },
  };

  function totalCell(colId: string): React.ReactNode {
    if (!(colId in totalsMap)) return null;
    const k = colId as RemovalColTotalKey;
    const t = totalsMap[k];
    const clickable = typeof onToggleColTotal === "function";
    const active = colTotalFilter === k;
    const display = t.currency
      ? `$${t.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : t.value.toLocaleString();
    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={() => onToggleColTotal?.(k)}
        className={cn(
          "rounded px-1 py-0.5 font-mono text-[11px] font-bold text-blue-600 transition",
          clickable ? "cursor-pointer hover:bg-blue-50" : "cursor-default",
          active ? "bg-blue-100 ring-1 ring-blue-400" : undefined,
        )}
      >
        {display}
      </button>
    );
  }

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const toggleExpand = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  React.useEffect(() => { setPage(1); }, [rows]);
  const visibleColCount = React.useMemo(
    () => ORDERS_TABLE_COLUMNS.filter((c) => show(c.id)).length + 1,
    [visibility],
  );
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">📭</span>
        <p className="text-sm font-semibold text-foreground">No removal orders</p>
        <p className="text-xs">Upload FBA removals report or adjust filters</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
    <div className="rounded-md border border-slate-200 bg-white">
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
          <TableRow>
            <TableHead className="h-11 w-8 px-1" aria-label="Expand" />
            {ORDERS_TABLE_COLUMNS.filter((c) => show(c.id)).map((c) => {
              const hasTotal = c.id in totalsMap;
              const alignItems =
                c.align === "right"
                  ? "items-end"
                  : c.align === "center"
                    ? "items-center"
                    : "items-start";
              return (
                <TableHead
                  key={c.id}
                  className={cn(
                    "whitespace-nowrap h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                  )}
                >
                  <div className={cn("flex flex-col gap-0.5", alignItems)}>
                    <span>{c.label}</span>
                    {hasTotal ? (
                      <span className="text-[11px] normal-case tracking-normal">
                        {totalCell(c.id)}
                      </span>
                    ) : null}
                  </div>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRows.map((r) => {
            const details = r.trackingDetails ?? [];
            const canExpand = details.length > 1;
            const isOpen = expanded.has(r.removalId);
            return (
            <React.Fragment key={r.removalId}>
            <TableRow
              className={cn(
                "cursor-default hover:bg-slate-50/40",
                isOpen && "bg-slate-50/60",
              )}
            >
              <TableCell className="w-8 px-1 align-middle">
                {canExpand ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(r.removalId)}
                    className="flex size-5 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                    title={isOpen ? "Collapse trackings" : "Show trackings"}
                    aria-expanded={isOpen}
                  >
                    <ChevronRight
                      className={cn("size-3.5 transition-transform", isOpen && "rotate-90")}
                      aria-hidden
                    />
                  </button>
                ) : null}
              </TableCell>
              {show("request_date") && <TableCell className="font-mono text-[11px] text-muted-foreground">{r.requestDate}</TableCell>}
              {show("order_id") && (
                <TableCell className="font-mono text-[11px]">
                  <OrderIdCell row={r} trackings={orderTrackingMap.get(r.orderId) ?? []} />
                </TableCell>
              )}
              {show("msku") && (
                <TableCell className="max-w-[160px] overflow-hidden whitespace-nowrap font-mono text-[11px]">
                  <MskuCell row={r} />
                </TableCell>
              )}
              {show("fnsku") && (
                <TableCell className="font-mono text-[11px]">
                  <FnskuCell row={r} />
                </TableCell>
              )}
              {show("type") && <TableCell className="text-[11px]">{r.orderType}</TableCell>}
              {show("order_status") && (
                <TableCell>
                  <OrderStatusChip status={r.orderStatus} />
                </TableCell>
              )}
              {show("disposition") && (
                <TableCell className="text-[11px]">
                  <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                    {r.disposition}
                  </Badge>
                </TableCell>
              )}
              {show("carrier") && <TableCell className="text-[11px]">{r.carriers || "—"}</TableCell>}
              {show("tracking") && (
                <TableCell className="font-mono text-[10px]">
                  <TrackingCell row={r} />
                </TableCell>
              )}
              {show("requestedQty") && <TableCell className="text-right font-mono text-xs">{r.requestedQty}</TableCell>}
              {show("expected") && <TableCell className="text-right font-mono text-xs">{r.expectedShipped}</TableCell>}
              {show("actualShipped") && (
                <TableCell className="text-right font-mono text-xs font-bold text-emerald-700">
                  {r.actualShipped > 0 ? r.actualShipped : "—"}
                </TableCell>
              )}
              {show("receivedQty") && (
                <TableCell className="text-right">
                  <ReceivedCell row={r} />
                </TableCell>
              )}
              {show("wrong") && (
                <TableCell className="text-center">
                  <WrongItemBadge count={r.wrongItemCount} />
                </TableCell>
              )}
              {show("reimbQty") && (
                <TableCell className="text-right font-mono text-xs">
                  <ReimbQtyCell row={r} />
                </TableCell>
              )}
              {show("reimbAmount") && (
                <TableCell className="text-right font-mono text-xs">
                  <ReimbAmtCell row={r} />
                </TableCell>
              )}
              {show("removalFee") && (
                <TableCell className="text-right font-mono text-xs">
                  {r.removalFee > 0 ? `$${r.removalFee.toFixed(2)}` : "—"}
                </TableCell>
              )}
              {show("status") && (
                <TableCell className="text-center">
                  <RemovalStatusBadge status={r.receiptStatus} />
                </TableCell>
              )}
              {show("actions") && (
                <TableCell className="whitespace-nowrap align-middle">
                  <ActionButtons
                    row={r}
                    onReceive={onReceive}
                    onRaiseCase={onRaiseCase}
                    onUnlock={onUnlock}
                  />
                </TableCell>
              )}
            </TableRow>
            {isOpen && canExpand ? (
              <TableRow className="bg-slate-50/40 hover:bg-slate-50/40">
                <TableCell colSpan={visibleColCount} className="p-0">
                  <TrackingDetailRows details={details} />
                </TableCell>
              </TableRow>
            ) : null}
            </React.Fragment>
          );
          })}
        </TableBody>
      </table>
    </div>
    <Pagination page={page} pageSize={pageSize} totalRows={rows.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}

export const ORDERS_TABLE_COLUMNS = [
  { id: "request_date", label: "Request Date", align: "left" as const },
  { id: "order_id", label: "Order ID", align: "left" as const },
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "fnsku", label: "FNSKU", align: "left" as const },
  { id: "type", label: "Type", align: "left" as const },
  { id: "order_status", label: "Order Status", align: "left" as const },
  { id: "disposition", label: "Disposition", align: "left" as const },
  { id: "carrier", label: "Carrier", align: "left" as const },
  { id: "tracking", label: "Tracking", align: "left" as const },
  { id: "requestedQty", label: "Req.", align: "right" as const },
  { id: "expected", label: "Exp.", align: "right" as const },
  { id: "actualShipped", label: "Shipped", align: "right" as const },
  { id: "receivedQty", label: "Rcvd", align: "right" as const },
  { id: "wrong", label: "Wrong Item", align: "center" as const },
  { id: "reimbQty", label: "Reimb. Qty", align: "right" as const },
  { id: "reimbAmount", label: "Reimb. $", align: "right" as const },
  { id: "removalFee", label: "Fee", align: "right" as const },
  { id: "status", label: "Status", align: "center" as const },
  { id: "actions", label: "Actions", align: "left" as const },
];

function TrackingDetailRows({ details }: { details: TrackingDetail[] }) {
  return (
    <div className="border-l-2 border-blue-200 bg-slate-50/60 px-4 py-2">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Per-tracking breakdown ({details.length})
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-slate-400">
            <th className="px-2 py-1 text-left font-semibold">Tracking #</th>
            <th className="px-2 py-1 text-left font-semibold">Carrier</th>
            <th className="px-2 py-1 text-right font-semibold">Shipped</th>
            <th className="px-2 py-1 text-right font-semibold">Rcvd</th>
            <th className="px-2 py-1 text-right font-semibold">Sellable</th>
            <th className="px-2 py-1 text-right font-semibold">Unsellable</th>
            <th className="px-2 py-1 text-right font-semibold">Missing</th>
          </tr>
        </thead>
        <tbody>
          {details.map((d) => (
            <tr key={d.tracking} className="border-t border-slate-200/70">
              <td className="px-2 py-1 font-mono text-foreground">{d.tracking}</td>
              <td className="px-2 py-1 text-muted-foreground">{d.carrier || "—"}</td>
              <td className="px-2 py-1 text-right font-mono font-bold text-emerald-700">
                {d.shipped > 0 ? d.shipped : "—"}
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {d.received > 0 ? <span className="font-bold text-blue-700">{d.received}</span> : "—"}
              </td>
              <td className="px-2 py-1 text-right font-mono text-emerald-700">
                {d.sellable > 0 ? d.sellable : "—"}
              </td>
              <td className="px-2 py-1 text-right font-mono text-amber-700">
                {d.unsellable > 0 ? d.unsellable : "—"}
              </td>
              <td className="px-2 py-1 text-right font-mono text-red-600">
                {d.missing > 0 ? d.missing : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[9px] italic text-slate-400">
        Removal fee is billed per order, not per tracking — see the Fee column on the parent row.
      </p>
    </div>
  );
}

function OrderStatusChip({ status }: { status: string }) {
  const cls =
    status === "Completed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "In Progress"
        ? "bg-blue-50 text-blue-700"
        : status === "Cancelled"
          ? "bg-slate-100 text-slate-600"
          : "bg-slate-50 text-slate-600";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", cls)}>
      {status}
    </span>
  );
}

function ReceivedCell({ row }: { row: RemovalReconRow }) {
  if (row.receivedQty === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  return (
    <CellHoverPopover
      trigger={
        <span className="font-bold text-blue-700">{row.receivedQty}</span>
      }
      title="Receipt breakdown"
      count={row.receiptCount > 0 ? row.receiptCount : null}
      side="left"
      width={280}
    >
      <CellHoverRow left="✓ Sellable" right={row.sellableQty} />
      <CellHoverRow left="⚠ Unsellable" right={row.unsellableQty} />
      {row.missingQty > 0 ? (
        <CellHoverRow left="✕ Missing" right={row.missingQty} />
      ) : null}
      {row.wrongItemCount > 0 ? (
        <CellHoverRow left="✕ Wrong item" right={row.wrongItemCount} />
      ) : null}
      {row.postActions ? (
        <div className="border-t border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
          Post action: {row.postActions}
        </div>
      ) : null}
      {row.finalStatuses ? (
        <div className="border-t border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
          Final: {row.finalStatuses}
        </div>
      ) : null}
    </CellHoverPopover>
  );
}

function TrackingCell({ row }: { row: RemovalReconRow }) {
  const raw = (row.trackingNumbers || "").trim();
  if (!raw) return <span className="text-muted-foreground">—</span>;
  const list = raw
    .split(/[|,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const first = list[0] ?? raw;
  if (list.length <= 1) {
    return (
      <span className="block max-w-[140px] truncate" title={first}>
        {first}
      </span>
    );
  }
  return (
    <CellHoverPopover
      trigger={
        <span className="block max-w-[140px] truncate">
          {first}{" "}
          <span className="text-[9px] text-muted-foreground">
            +{list.length - 1}
          </span>
        </span>
      }
      title="Tracking numbers"
      count={list.length}
      side="bottom"
      width={320}
    >
      {list.map((t, i) => (
        <div key={i} className="border-b border-border/60 px-2 py-1 last:border-b-0">
          <span className="font-mono">{t}</span>
        </div>
      ))}
    </CellHoverPopover>
  );
}

function OrderIdCell({
  row,
  trackings,
}: {
  row: RemovalReconRow;
  trackings: OrderTrackingAgg[];
}) {
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(row.orderId).catch(() => {});
  };
  const totalCount = trackings.reduce((s, t) => s + t.count, 0);
  const totalFee = trackings.reduce((s, t) => s + t.fee, 0);
  return (
    <CellHoverPopover
      trigger={
        <span className="text-blue-700 underline-offset-2 hover:underline">
          {row.orderId}
        </span>
      }
      title="Tracking breakdown"
      count={trackings.length}
      side="right"
      width={360}
    >
      <CellHoverRow left="Order ID" right={row.orderId} />
      <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Tracking #</span>
        <span className="text-right">Count</span>
        <span className="text-right">Fee</span>
      </div>
      {trackings.length === 0 ? (
        <div className="px-2 py-2 text-center text-[11px] text-muted-foreground">
          No tracking data
        </div>
      ) : (
        trackings.map((t) => (
          <div
            key={t.tracking}
            className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-b border-border/60 px-2 py-1 last:border-b-0"
          >
            <span className="truncate font-mono text-foreground" title={t.tracking}>
              {t.tracking}
            </span>
            <span className="text-right font-mono tabular-nums text-muted-foreground">
              {t.count}×
            </span>
            <span className="text-right font-mono tabular-nums text-muted-foreground">
              ${t.fee.toFixed(2)}
            </span>
          </div>
        ))
      )}
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-t-2 border-border px-2 py-1 font-semibold">
        <span className="text-foreground">Total</span>
        <span className="text-right font-mono tabular-nums text-foreground">
          {totalCount}×
        </span>
        <span className="text-right font-mono tabular-nums text-foreground">
          ${totalFee.toFixed(2)}
        </span>
      </div>
      <button
        type="button"
        onClick={copy}
        className="mt-1 block w-full rounded-md border border-border/60 px-2 py-1 text-[10px] hover:bg-slate-50"
      >
        📋 Copy Order ID
      </button>
    </CellHoverPopover>
  );
}

function MskuCell({ row }: { row: RemovalReconRow }) {
  return (
    <span className="block max-w-[140px] truncate text-foreground" title={row.msku}>
      {row.msku}
    </span>
  );
}

function FnskuCell({ row }: { row: RemovalReconRow }) {
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(row.fnsku).catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Click to copy FNSKU"
      className="cursor-pointer rounded px-1 hover:bg-slate-100"
    >
      {row.fnsku}
    </button>
  );
}

function ReimbQtyCell({ row }: { row: RemovalReconRow }) {
  if (row.reimbQty === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const onlyCase = row.rrReimbQty === 0 && row.ctReimbQty > 0;
  return (
    <CellHoverPopover
      trigger={
        <span>
          <span className="font-bold text-emerald-700">{row.reimbQty}</span>
          {onlyCase ? (
            <span className="ml-1 rounded bg-blue-50 px-1 py-0.5 text-[9px] font-bold text-blue-700">
              CASE
            </span>
          ) : null}
        </span>
      }
      title="Reimbursement breakdown"
      side="left"
      width={300}
    >
      <CellHoverRow
        left="Removal report (RR)"
        right={`${row.rrReimbQty} u`}
      />
      <CellHoverRow
        left="From case (CT)"
        right={`${row.ctReimbQty} u`}
      />
      <CellHoverRow left="Total" right={`${row.reimbQty} u`} />
      {row.caseCount > 0 ? (
        <div className="border-t border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
          Cases: {row.caseIds || `${row.caseCount} open`}
        </div>
      ) : null}
    </CellHoverPopover>
  );
}

function ReimbAmtCell({ row }: { row: RemovalReconRow }) {
  if (row.reimbAmount === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const hasSplit =
    row.rrReimbAmount > 0 && row.ctReimbAmount > 0;
  if (!hasSplit) {
    return (
      <span className="font-bold text-emerald-700">
        ${row.reimbAmount.toFixed(2)}
      </span>
    );
  }
  return (
    <CellHoverPopover
      trigger={
        <span className="font-bold text-emerald-700">
          ${row.reimbAmount.toFixed(2)}
        </span>
      }
      title="Reimbursement amount"
      side="left"
      width={300}
    >
      <CellHoverRow
        left="Removal report (RR)"
        right={`$${row.rrReimbAmount.toFixed(2)}`}
      />
      <CellHoverRow
        left="From case (CT)"
        right={`$${row.ctReimbAmount.toFixed(2)}`}
      />
      <CellHoverRow left="Total" right={`$${row.reimbAmount.toFixed(2)}`} />
    </CellHoverPopover>
  );
}

function ActionButtons({
  row,
  onReceive,
  onRaiseCase,
  onUnlock,
}: {
  row: RemovalReconRow;
  onReceive: (row: RemovalReconRow) => void;
  onRaiseCase: (row: RemovalReconRow) => void;
  onUnlock: (row: RemovalReconRow) => void;
}) {
  const isCompleted = row.orderStatus === "Completed" && row.actualShipped > 0;
  if (!isCompleted) {
    return (
      <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-400">
        📦 N/A
      </span>
    );
  }
  if (row.isLocked) {
    const label =
      row.reimbQty > 0
        ? row.rrReimbQty > 0
          ? "💰 Reimbursed"
          : "📋 Case Reimb"
        : row.receivedQty >= row.expectedShipped
          ? "🔒 Fully Rcvd"
          : "🔒 Partial Rcvd";
    return (
      <div className="flex items-center gap-1">
        <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
          <Lock className="mr-1 inline size-3" aria-hidden />
          {label}
        </span>
        <button
          type="button"
          onClick={() => onUnlock(row)}
          className="flex size-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-500 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"
          title="Unlock"
        >
          <Unlock className="size-3" aria-hidden />
        </button>
      </div>
    );
  }
  const hasCase = row.caseCount > 0;
  return (
    <div className="inline-flex flex-nowrap items-center gap-1">
      <button
        type="button"
        onClick={() => onReceive(row)}
        className="flex h-6 shrink-0 items-center gap-1 rounded bg-blue-600 px-2 text-[10px] font-bold text-white hover:bg-blue-700"
        title="Mark Received"
      >
        <Package className="size-3 shrink-0" aria-hidden /> Receive
      </button>
      {!hasCase ? (
        <button
          type="button"
          onClick={() => onRaiseCase(row)}
          className="flex h-6 shrink-0 items-center gap-1 rounded bg-emerald-600 px-2 text-[10px] font-bold text-white hover:bg-emerald-700"
          title="Raise case — saved to Cases & Adjustments"
        >
          <ScrollText className="size-3 shrink-0" aria-hidden /> Case Raised
        </button>
      ) : null}
    </div>
  );
}
