"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ActionCacheEntry, ShipmentReconRow } from "@/lib/shipment-reconciliation-logic";
import { tableRowDerived } from "@/lib/shipment-reconciliation-logic";

function overlayOrEmpty(ca?: ActionCacheEntry): ActionCacheEntry {
  return (
    ca ?? {
      case_raised: 0,
      case_approved: 0,
      case_amount: 0,
      adj_qty: 0,
      case_status: null,
      case_count: 0,
      case_ids: [],
    }
  );
}

export function ReconStatusBadge({
  row,
  overlay,
}: {
  row: ShipmentReconRow;
  overlay: Record<string, ActionCacheEntry>;
}) {
  const fk = String(row.fnsku ?? "").trim().replace(/['"]/g, "");
  const d = tableRowDerived(row, overlayOrEmpty(overlay[fk]));
  const k = d.statusBadgeKind;
  if (k === "matched") {
    return (
      <Badge className="rounded-full border border-emerald-200 bg-emerald-50 font-mono text-[10px] text-emerald-700">
        Matched
      </Badge>
    );
  }
  if (k === "excess") {
    return (
      <Badge className="rounded-full border border-blue-200 bg-blue-50 font-mono text-[10px] text-blue-700">
        Excess
      </Badge>
    );
  }
  if (k === "reimbursed") {
    return (
      <Badge className="rounded-full border border-emerald-200 bg-emerald-50 font-mono text-[10px] text-emerald-700">
        💰 Reimbursed
      </Badge>
    );
  }
  if (k === "action_taken") {
    return (
      <Badge className="rounded-full border border-emerald-300 bg-emerald-50 font-mono text-[10px] text-emerald-800">
        ✓ Action Taken
      </Badge>
    );
  }
  if (k === "case_raised") {
    return (
      <Badge className="rounded-full border border-orange-200 bg-orange-50 font-mono text-[10px] text-orange-800">
        ⚖️ Case Raised
      </Badge>
    );
  }
  if (k === "in_progress") {
    return (
      <Badge className="rounded-full border border-violet-200 bg-violet-50 font-mono text-[10px] text-violet-800">
        In Progress
      </Badge>
    );
  }
  if (k === "partial_reimb") {
    return (
      <Badge className="rounded-full border border-violet-200 bg-violet-50 font-mono text-[10px] text-violet-800">
        Partial Reimb
      </Badge>
    );
  }
  return (
    <Badge className="rounded-full border border-red-200 bg-red-50 font-mono text-[10px] text-red-800">
      ⚠ Take Action
    </Badge>
  );
}

export function PendingCell({
  row,
  overlay,
}: {
  row: ShipmentReconRow;
  overlay: Record<string, ActionCacheEntry>;
}) {
  const fk = String(row.fnsku ?? "").trim().replace(/['"]/g, "");
  const { pendingDisp } = tableRowDerived(row, overlayOrEmpty(overlay[fk]));
  if (pendingDisp.kind === "zero") {
    return <span className="font-mono text-xs font-bold text-emerald-600">0</span>;
  }
  if (pendingDisp.kind === "check") {
    return (
      <div className="text-right">
        <span className="font-mono text-xs font-bold text-emerald-600">✓</span>
        <div className="text-[10px] text-muted-foreground line-through">
          was&nbsp;-{pendingDisp.was}
        </div>
      </div>
    );
  }
  if (pendingDisp.kind === "partial") {
    return (
      <div className="text-right">
        <span className="font-mono text-xs font-bold text-red-600">
          -{pendingDisp.effective}
        </span>
        <div className="text-[10px] text-muted-foreground line-through">
          was&nbsp;-{pendingDisp.was}
        </div>
      </div>
    );
  }
  return (
    <span className="font-mono text-xs font-bold text-red-600">
      -{pendingDisp.pending}
    </span>
  );
}

export function CaseRaisedCell({
  row,
  overlay,
}: {
  row: ShipmentReconRow;
  overlay: Record<string, ActionCacheEntry>;
}) {
  const fk = String(row.fnsku ?? "").trim().replace(/['"]/g, "");
  const ca = overlayOrEmpty(overlay[fk]);
  const top = ca.case_status;
  if (ca.case_count <= 0) {
    return (
      <span className="font-mono text-[13px] text-slate-300">—</span>
    );
  }
  const statColor =
    top === "approved" || top === "resolved"
      ? "text-emerald-600"
      : top === "raised" || top === "pending"
        ? "text-orange-600"
        : top === "rejected"
          ? "text-red-600"
          : "text-muted-foreground";
  const statLabel =
    top && top.length > 0
      ? top.charAt(0).toUpperCase() + top.slice(1)
      : "";
  const approvedQty = ca.case_approved || 0;
  const approvedAmt = ca.case_amount || 0;
  return (
    <div className="flex flex-col items-center gap-0.5 text-center">
      <div>
        <span className="font-mono text-xs font-bold text-orange-600">
          +{ca.case_raised}
        </span>
        <span className="ml-0.5 text-[9px] text-muted-foreground">claimed</span>
      </div>
      {approvedQty > 0 ? (
        <div className="mt-0.5">
          <span className="font-mono text-xs font-bold text-emerald-600">
            +{approvedQty}
          </span>
          <span className="ml-0.5 text-[9px] text-emerald-600">approved</span>
          {approvedAmt > 0 ? (
            <span className="ml-1 text-[9px] text-emerald-600">
              ${approvedAmt.toFixed(2)}
            </span>
          ) : null}
        </div>
      ) : null}
      {statLabel ? (
        <div className={cn("mt-0.5 text-[9px] font-bold", statColor)}>
          {statLabel}
        </div>
      ) : null}
    </div>
  );
}

export function AdjQtyCell({
  row,
  overlay,
}: {
  row: ShipmentReconRow;
  overlay: Record<string, ActionCacheEntry>;
}) {
  const fk = String(row.fnsku ?? "").trim().replace(/['"]/g, "");
  const ca = overlayOrEmpty(overlay[fk]);
  if (!ca.adj_qty) {
    return (
      <span className="font-mono text-[13px] text-slate-300">—</span>
    );
  }
  const pos = ca.adj_qty > 0;
  return (
    <div className="text-center">
      <span
        className={cn(
          "font-mono text-xs font-bold",
          pos ? "text-emerald-600" : "text-red-600",
        )}
      >
        {pos ? "+" : ""}
        {ca.adj_qty}
      </span>
      <div className="text-[10px] text-muted-foreground">adjusted</div>
    </div>
  );
}

export function ReimbCell({
  row,
  overlay,
}: {
  row: ShipmentReconRow;
  overlay: Record<string, ActionCacheEntry>;
}) {
  const fk = String(row.fnsku ?? "").trim().replace(/['"]/g, "");
  const { reimbDisplayQty, reimbShowCaseHint } = tableRowDerived(
    row,
    overlayOrEmpty(overlay[fk]),
  );
  if (row.reimb_qty <= 0 && reimbDisplayQty <= 0) {
    return (
      <span className="font-mono text-[11px] text-muted-foreground">—</span>
    );
  }
  return (
    <div className="text-right">
      <span className="font-mono text-xs font-bold text-blue-600">
        +{reimbDisplayQty}
      </span>
      {reimbShowCaseHint ? (
        <div className="mt-0.5 text-[9px] text-blue-400">📋 case</div>
      ) : null}
    </div>
  );
}

export function ReceiveProgress({
  shipped,
  received,
}: {
  shipped: number;
  received: number;
}) {
  const pct = shipped > 0 ? Math.round((received / shipped) * 100) : 100;
  const pfc =
    pct >= 100 ? "bg-emerald-500" : pct >= 85 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="mt-1 h-1 w-[60px] max-w-full overflow-hidden rounded bg-slate-200">
      <div
        className={cn("h-full rounded-sm", pfc)}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export function ReceivedCell({ row }: { row: ShipmentReconRow }) {
  const pct =
    row.shipped_qty > 0
      ? Math.round((row.received_qty / row.shipped_qty) * 100)
      : 100;
  const highlight = row.received_qty > row.shipped_qty;
  const rateColor =
    pct >= 100 ? "text-emerald-300" : pct >= 85 ? "text-amber-300" : "text-red-300";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help text-right">
          <span
            className={cn(
              "font-mono text-xs",
              highlight ? "font-bold text-blue-600" : undefined,
            )}
          >
            {row.received_qty}
          </span>
          <ReceiveProgress shipped={row.shipped_qty} received={row.received_qty} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="end">
        <div className="space-y-0.5">
          <div className="flex justify-between gap-4">
            <span className="text-slate-300">Received</span>
            <span className="font-mono font-semibold">
              {row.received_qty} / {row.shipped_qty}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-300">Receipt Rate</span>
            <span className={cn("font-mono font-semibold", rateColor)}>{pct}%</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function statusChipClass(kind: string): string {
  switch (kind) {
    case "matched":
      return "bg-emerald-500/20 text-emerald-300";
    case "excess":
      return "bg-blue-500/20 text-blue-300";
    case "reimbursed":
      return "bg-emerald-500/20 text-emerald-300";
    case "action_taken":
      return "bg-emerald-500/20 text-emerald-300";
    case "case_raised":
      return "bg-orange-500/20 text-orange-300";
    case "in_progress":
      return "bg-violet-500/20 text-violet-300";
    case "partial_reimb":
      return "bg-violet-500/20 text-violet-300";
    default:
      return "bg-red-500/20 text-red-300";
  }
}

function statusChipLabel(kind: string): string {
  switch (kind) {
    case "matched":
      return "Matched";
    case "excess":
      return "Excess";
    case "reimbursed":
      return "Reimbursed";
    case "action_taken":
      return "Action Taken";
    case "case_raised":
      return "Case Raised";
    case "in_progress":
      return "In Progress";
    case "partial_reimb":
      return "Partial Reimb";
    default:
      return "Take Action";
  }
}

export function ShortageCell({
  row,
  overlay,
}: {
  row: ShipmentReconRow;
  overlay: Record<string, ActionCacheEntry>;
}) {
  const fk = String(row.fnsku ?? "").trim().replace(/['"]/g, "");
  const ca = overlayOrEmpty(overlay[fk]);
  const d = tableRowDerived(row, ca);
  const display =
    row.shortage > 0 ? (
      <span className="font-mono text-xs font-bold text-red-600">
        -{row.shortage}
      </span>
    ) : (
      <span className="font-mono text-xs font-bold text-emerald-600">0</span>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help text-right">{display}</div>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" className="w-56">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-300">Recon Status</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                statusChipClass(d.statusBadgeKind),
              )}
            >
              {statusChipLabel(d.statusBadgeKind)}
            </span>
          </div>
          <div className="my-1 h-px bg-slate-700" />
          <div className="flex justify-between gap-4">
            <span className="text-slate-300">Shortage</span>
            <span className="font-mono font-semibold">{row.shortage}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-300">Reimb. Qty</span>
            <span className="font-mono font-semibold">{row.reimb_qty}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-300">Case Reimb.</span>
            <span className="font-mono font-semibold">{d.approvedQty}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-300">Cases Raised</span>
            <span className="font-mono font-semibold">
              {ca.case_raised}
              {ca.case_status ? ` (${ca.case_status})` : ""}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-300">Adjusted</span>
            <span className="font-mono font-semibold">{ca.adj_qty}</span>
          </div>
          <div className="my-1 h-px bg-slate-700" />
          <div className="flex justify-between gap-4">
            <span className="text-slate-300">Still Pending</span>
            <span
              className={cn(
                "font-mono font-bold",
                d.effectivePending > 0 ? "text-red-300" : "text-emerald-300",
              )}
            >
              {d.effectivePending}
            </span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
