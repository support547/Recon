"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  ActionCacheEntry,
  ShipmentReconRow,
} from "@/lib/shipment-reconciliation-logic";
import {
  drawerAlertKind,
  drawerEffectivePending,
  drawerTotalActioned,
  trimCl,
} from "@/lib/shipment-reconciliation-logic";

function overlayForRow(
  overlay: Record<string, ActionCacheEntry>,
  row: ShipmentReconRow,
): ActionCacheEntry {
  const k = trimCl(row.fnsku);
  return (
    overlay[k] ?? {
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

export function ReconDetailSheet({
  row,
  overlay,
  open,
  onOpenChange,
  onOpenAction,
}: {
  row: ShipmentReconRow | null;
  overlay: Record<string, ActionCacheEntry>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenAction: (row: ShipmentReconRow, mode: "case" | "adj") => void;
}) {
  if (!row) return null;

  const ca = overlayForRow(overlay, row);
  const _ep = drawerEffectivePending(row, ca);
  const _tact = drawerTotalActioned(ca);
  const pct =
    row.shipped_qty > 0
      ? Math.round((row.received_qty / row.shipped_qty) * 100)
      : 100;
  const alertKind = drawerAlertKind(row, ca);

  let alertBlock: React.ReactNode;
  if (alertKind === "reconciled") {
    alertBlock = (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
        ✅ Fully reconciled. No action needed.
      </div>
    );
  } else if (alertKind === "actioned") {
    const parts: string[] = [];
    if (ca.case_raised > 0)
      parts.push(`${ca.case_raised} units in Amazon case`);
    if (ca.adj_qty)
      parts.push(`${ca.adj_qty > 0 ? "+" : ""}${ca.adj_qty} adjusted`);
    alertBlock = (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
        ✅ All {row.shortage} missing units actioned ({parts.join(", ")}).
        <br />
        Awaiting Amazon resolution.
      </div>
    );
  } else if (alertKind === "partial_reimb") {
    alertBlock = (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
        ✅ {row.reimb_qty} units reimbursed by Amazon.
        {_ep > 0 ? (
          <>
            {" "}
            <b>{_ep} units</b> still pending.
          </>
        ) : (
          " Fully resolved."
        )}
      </div>
    );
  } else {
    alertBlock = (
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs leading-relaxed text-orange-900">
        <div className="mb-1 text-[13px] font-bold">
          ⚠️ Action Required — {_ep} units unresolved
        </div>
        {_tact > 0 ? (
          <span className="text-[11px] text-emerald-700">
            ✓ {_tact} units already actioned
          </span>
        ) : null}
        {_tact > 0 ? <br /> : null}
        {_tact > 0 ? <br /> : null}
        <b>Steps:</b> Seller Central → Help → FBA Issue → Shipment to Amazon
        <br />
        Shipment: <b>{row.shipment_id}</b> · FNSKU: <b>{row.fnsku}</b>
        <br />
        Claim: <b>{_ep} units</b> (Lost_Inbound / Short Received)
      </div>
    );
  }

  const showCaseAdj =
    row.status === "case_needed" || row.shortage > 0;
  const showAdjOnlyPartial = row.status === "partial";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-slate-200 px-5 py-4 text-left">
          <SheetTitle className="text-base">{row.msku}</SheetTitle>
          <p className="font-mono text-[11px] text-muted-foreground">
            {row.shipment_id} · {row.ship_date}
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-xs">
          <div className="flex justify-between gap-2 border-b border-slate-100 py-2">
            <span className="font-medium text-muted-foreground">Title</span>
            <span className="max-w-[260px] break-all text-right font-mono text-[11px] font-semibold">
              {row.title}
            </span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 py-2">
            <span className="font-medium text-muted-foreground">ASIN</span>
            <span className="font-mono text-[11px] font-semibold">{row.asin}</span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 py-2">
            <span className="font-medium text-muted-foreground">FNSKU</span>
            <span className="font-mono text-[11px] font-semibold">{row.fnsku}</span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 py-2">
            <span className="font-medium text-muted-foreground">Ship Date</span>
            <span className="font-mono text-[11px] font-semibold">
              {row.ship_date}
            </span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 py-2">
            <span className="font-medium text-muted-foreground">
              Last Updated
            </span>
            <span className="font-mono text-[11px] font-semibold">
              {row.last_updated || "—"}
              {row.days_open !== "—" ? ` (${row.days_open} days)` : ""}
            </span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 py-2">
            <span className="font-medium text-muted-foreground">
              Shipment Status
            </span>
            <span className="font-mono text-[11px] font-semibold">
              {row.shipment_status}
            </span>
          </div>

          <div className="mb-1 mt-4 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Reconciliation Flow
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex justify-between border-b border-dashed border-slate-200 py-1.5">
              <span className="text-slate-600">📤 Shipped to FBA</span>
              <span className="font-mono text-[13px] font-bold text-blue-600">
                {row.shipped_qty}
              </span>
            </div>
            <div className="flex justify-between border-b border-dashed border-slate-200 py-1.5">
              <span className="text-slate-600">✅ FBA Received</span>
              <span
                className={`font-mono text-[13px] font-bold ${row.received_qty >= row.shipped_qty ? "text-emerald-600" : "text-red-600"}`}
              >
                {row.received_qty} <small>({pct}%)</small>
              </span>
            </div>
            <div className="flex justify-between border-b border-dashed border-slate-200 py-1.5">
              <span className="text-slate-600">⚠️ Shortage</span>
              <span
                className={`font-mono text-[13px] font-bold ${row.shortage > 0 ? "text-red-600" : "text-emerald-600"}`}
              >
                {row.shortage > 0 ? `-${row.shortage}` : "0"}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-600">💰 Reimbursed (Lost_Inbound)</span>
              <span className="font-mono text-[13px] font-bold text-emerald-600">
                {row.reimb_qty > 0 ? `+${row.reimb_qty}` : "—"}
              </span>
            </div>
            <div className="mt-2 flex justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
              <span className="font-bold">Pending / Unresolved</span>
              <span
                className={`font-mono text-[15px] font-extrabold ${row.pending > 0 ? "text-red-600" : "text-emerald-600"}`}
              >
                {row.pending > 0 ? `${row.pending} units` : "✓ Clear"}
              </span>
            </div>
          </div>

          <div className="mt-3">{alertBlock}</div>

          {showCaseAdj ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="bg-orange-50 text-orange-900 hover:bg-orange-100"
                onClick={() => onOpenAction(row, "case")}
              >
                📋 Raise Case
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenAction(row, "adj")}
              >
                🔧 Adjust
              </Button>
            </div>
          ) : showAdjOnlyPartial ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenAction(row, "adj")}
              >
                🔧 Adjust
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
