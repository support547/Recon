"use client";

import * as React from "react";
import { Eye, Lock, Package, Receipt, ScrollText, Unlock, DollarSign } from "lucide-react";

import {
  Table,
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
import type { RemovalReconRow } from "@/lib/removal-reconciliation/types";

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
  onCase,
  onReimb,
  onUnlock,
  colTotalFilter,
  onToggleColTotal,
}: {
  rows: RemovalReconRow[];
  onReceive: (row: RemovalReconRow) => void;
  onCase: (row: RemovalReconRow) => void;
  onReimb: (row: RemovalReconRow) => void;
  onUnlock: (row: RemovalReconRow) => void;
  colTotalFilter?: RemovalColTotalKey | null;
  onToggleColTotal?: (k: RemovalColTotalKey) => void;
}) {
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
    <div className="max-h-[70vh] overflow-y-auto rounded-md border border-slate-200 bg-white">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
          <TableRow>
            {COLUMNS.map((c) => {
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
                    "whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground",
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
          {rows.map((r) => (
            <TableRow key={r.removalId} className="hover:bg-slate-50">
              <TableCell className="font-mono text-[11px] text-muted-foreground">{r.requestDate}</TableCell>
              <TableCell className="font-mono text-[11px]">{r.orderId}</TableCell>
              <TableCell className="max-w-[150px] truncate font-mono text-[11px]" title={r.msku}>
                {r.msku}
              </TableCell>
              <TableCell className="font-mono text-[11px]">{r.fnsku}</TableCell>
              <TableCell className="text-[11px]">{r.orderType}</TableCell>
              <TableCell>
                <OrderStatusChip status={r.orderStatus} />
              </TableCell>
              <TableCell className="text-[11px]">
                <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                  {r.disposition}
                </Badge>
              </TableCell>
              <TableCell className="text-[11px]">{r.carriers || "—"}</TableCell>
              <TableCell className="font-mono text-[10px]">
                <TrackingCell row={r} />
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{r.requestedQty}</TableCell>
              <TableCell className="text-right font-mono text-xs">{r.expectedShipped}</TableCell>
              <TableCell className="text-right font-mono text-xs font-bold text-emerald-700">
                {r.actualShipped > 0 ? r.actualShipped : "—"}
              </TableCell>
              <TableCell className="text-right">
                <ReceivedCell row={r} />
              </TableCell>
              <TableCell className="text-center">
                <WrongItemBadge count={r.wrongItemCount} />
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                <ReimbQtyCell row={r} />
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                <ReimbAmtCell row={r} />
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {r.removalFee > 0 ? `$${r.removalFee.toFixed(2)}` : "—"}
              </TableCell>
              <TableCell className="text-center">
                <RemovalStatusBadge status={r.receiptStatus} />
              </TableCell>
              <TableCell>
                <ActionButtons
                  row={r}
                  onReceive={onReceive}
                  onCase={onCase}
                  onReimb={onReimb}
                  onUnlock={onUnlock}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const COLUMNS = [
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
    .split(/[,\n]/)
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
  onCase,
  onReimb,
  onUnlock,
}: {
  row: RemovalReconRow;
  onReceive: (row: RemovalReconRow) => void;
  onCase: (row: RemovalReconRow) => void;
  onReimb: (row: RemovalReconRow) => void;
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
  const hasIssue = row.missingQty > 0 || row.unsellableQty > 0;
  const hasCase = row.caseCount > 0;
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => onReceive(row)}
        className="flex h-6 items-center gap-1 rounded bg-blue-600 px-2 text-[10px] font-bold text-white hover:bg-blue-700"
        title="Mark Received"
      >
        <Package className="size-3" aria-hidden /> Receive
      </button>
      {!hasCase && hasIssue ? (
        <button
          type="button"
          onClick={() => onCase(row)}
          className="flex h-6 items-center gap-1 rounded bg-amber-500 px-2 text-[10px] font-bold text-white hover:bg-amber-600"
          title="Raise Case"
        >
          <ScrollText className="size-3" aria-hidden /> Case
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onReimb(row)}
        className="flex size-6 items-center justify-center rounded bg-emerald-600 text-white hover:bg-emerald-700"
        title="Enter Reimbursement"
      >
        <DollarSign className="size-3" aria-hidden />
      </button>
    </div>
  );
}
