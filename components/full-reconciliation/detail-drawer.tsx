"use client";

import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { FullStatusBadge } from "@/components/full-reconciliation/shared/status-badge";
import type { FullReconRow } from "@/lib/full-reconciliation/types";

export function DetailDrawer({
  row,
  open,
  onOpenChange,
}: {
  row: FullReconRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!row) return null;
  const shortageColor =
    row.shortageQty > 0 ? "text-red-600" : row.shortageQty < 0 ? "text-amber-600" : "text-emerald-600";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-mono text-base">{row.msku || "—"}</SheetTitle>
          <SheetDescription className="font-mono text-[11px]">
            {row.asin}{row.fnsku ? ` · ${row.fnsku}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="Shipped">{row.shippedQty}</Kpi>
            <Kpi label="Receipts">{row.receiptQty}</Kpi>
            <Kpi label="Shortage" className={shortageColor}>{row.shortageQty}</Kpi>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="Sold">{row.soldQty}</Kpi>
            <Kpi label="Last Recv">{row.latestRecvDate || "—"}</Kpi>
            <Kpi label="Last Sale">{row.latestSaleDate || "—"}</Kpi>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Recon Status</span>
              <FullStatusBadge status={row.reconStatus} />
            </div>
            <Row label="Ending Balance">{row.endingBalance}</Row>
            <Row label="FBA Balance">{row.fbaEndingBalance ?? "—"}</Row>
            <Row label="Variance">
              {row.fbaEndingBalance !== null ? row.fbaEndingBalance - row.endingBalance : "—"}
            </Row>
            <Row label="FBA Snapshot Date">{row.fbaSummaryDate || "—"}</Row>
          </div>

          <Section title="Breakdown">
            <Row label="Receipts">+{row.receiptQty}</Row>
            <Row label="Sold">−{row.soldQty}</Row>
            <Row label="Returns">+{row.returnQty}</Row>
            <Row label="Reimb">−{row.reimbQty}</Row>
            <Row label="Removal Rcpt">−{row.removalRcptQty}</Row>
            <Row label="Replacements">
              {row.replReturnQty > 0 ? `+${row.replReturnQty}` : row.replReimbQty > 0 ? `−${row.replReimbQty}` : "0"}
            </Row>
            <Row label="GNR Qty">−{row.gnrQty}</Row>
            <Row label="FC Transfer">{row.fcNetQty > 0 ? `+${row.fcNetQty}` : row.fcNetQty}</Row>
          </Section>

          <Section title="FBA Adjustments">
            <Row label="Vendor Returns">{row.fbaVendorReturns}</Row>
            <Row label="Found">{row.fbaFound}</Row>
            <Row label="Lost">{row.fbaLost}</Row>
            <Row label="Damaged">{row.fbaDamaged}</Row>
            <Row label="Disposed">{row.fbaDisposed}</Row>
            <Row label="Other">{row.fbaOther}</Row>
            <Row label="Unknown">{row.fbaUnknown}</Row>
            <Row label="Total">{row.fbaAdjTotal}</Row>
          </Section>

          {row.caseCount > 0 || row.adjQty !== 0 ? (
            <Section title="Cases & Adjustments">
              <Row label="Cases">{row.caseCount}{row.caseStatuses ? ` (${row.caseStatuses})` : ""}</Row>
              <Row label="Case Approved Qty">{row.caseReimbQty}</Row>
              <Row label="Case Approved $">${row.caseReimbAmt.toFixed(2)}</Row>
              <Row label="Manual Adj Qty">{row.adjQty}</Row>
              <Row label="Manual Adj Count">{row.adjCount}</Row>
            </Section>
          ) : null}

          {row.fcStatus ? (
            <Section title="FC Transfer">
              <Row label="Net">{row.fcNetQty}</Row>
              <Row label="IN">{row.fcInQty}</Row>
              <Row label="OUT">{row.fcOutQty}</Row>
              <Row label="Event Days">{row.fcEventDays}</Row>
              <Row label="Period">
                {row.fcEarliestDate} → {row.fcLatestDate}
              </Row>
              <Row label="Days Pending">{row.fcDaysPending}</Row>
              <Row label="Status">{row.fcStatus}</Row>
            </Section>
          ) : null}

          {row.replQty > 0 ? (
            <Section title="Replacements">
              <Row label="Replaced">{row.replQty}</Row>
              <Row label="Returned">{row.replReturnQty}</Row>
              <Row label="Reimbursed Qty">{row.replReimbQty}</Row>
              <Row label="Reimbursed $">${row.replReimbAmt.toFixed(2)}</Row>
              <Row label="Status">{row.replStatus}</Row>
            </Section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Kpi({
  label, children, className,
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2.5 text-center">
      <div className={cn("font-mono text-base font-bold", className)}>{children}</div>
      <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 text-xs">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1 last:border-b-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-[11px] font-semibold">{children}</span>
    </div>
  );
}
