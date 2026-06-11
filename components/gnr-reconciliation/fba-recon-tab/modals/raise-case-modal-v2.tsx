"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveGnrCaseAction } from "@/actions/gnr-reconciliation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GnrV2StatusBadge } from "@/components/gnr-reconciliation/fba-recon-tab/status-badge-v2";
import type { GnrV2Row } from "@/lib/gnr-reconciliation/v2/types";

/** Preset case reasons (mirrors the Returns Recon reason dropdown). */
const REASON_OPTIONS = [
  "GNR units graded but never re-added to inventory",
  "Lost in warehouse after grading",
  "Damaged in warehouse after grading",
  "Missing reimbursement for GNR shortfall",
  "Inventory ledger mismatch (no snapshot)",
  "Other",
];

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Raised" },
  { value: "IN_PROGRESS", label: "Pending" },
  { value: "RESOLVED", label: "Approved / Resolved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CLOSED", label: "Closed" },
];

const NO_USED_FNSKU = "(No Used FNSKU)";

/**
 * Raise-case modal for the FBA Recon v2 table — same standard form layout as the
 * Returns Recon raise-case modal. The saved row lands in caseTracker with
 * reconType=GNR, so it flows back into the v2 Case Appr column (buildCaseMapV2
 * keys cases by used FNSKU) on the next refresh.
 */
export function RaiseCaseModalV2({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: GnrV2Row | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [caseId, setCaseId] = React.useState("");
  const [caseReason, setCaseReason] = React.useState("");
  const [unitsClaimed, setUnitsClaimed] = React.useState(0);
  const [unitsApproved, setUnitsApproved] = React.useState(0);
  const [amountApproved, setAmountApproved] = React.useState(0);
  const [status, setStatus] = React.useState("OPEN");
  const [caseUrl, setCaseUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !row) return;
    setCaseId("");
    setCaseReason("");
    // Default the claim to the shortfall (|variance| when negative, else the gap).
    const shortfall =
      row.variance !== null && row.variance < 0
        ? Math.abs(row.variance)
        : row.inboundGap < 0
          ? Math.abs(row.inboundGap)
          : 0;
    setUnitsClaimed(shortfall || 1);
    setUnitsApproved(0);
    setAmountApproved(0);
    setStatus("OPEN");
    setCaseUrl("");
    setNotes("");
  }, [open, row]);

  if (!row) return null;

  async function onSubmit() {
    if (!row) return;
    if (!caseReason) {
      toast.error("Please select a case reason");
      return;
    }
    setBusy(true);
    try {
      // The GNR case action has no dedicated URL field; fold it into notes so the
      // link is still captured.
      const mergedNotes = [notes.trim(), caseUrl.trim() ? `Case URL: ${caseUrl.trim()}` : ""]
        .filter(Boolean)
        .join("\n");
      const res = await saveGnrCaseAction({
        usedMsku: row.usedMsku,
        usedFnsku: row.usedFnsku === NO_USED_FNSKU ? null : row.usedFnsku,
        asin: row.asin === "—" ? null : row.asin,
        caseId: caseId || null,
        caseReason,
        unitsClaimed,
        unitsApproved,
        amountApproved,
        status,
        notes: mergedNotes || null,
      });
      if (!res.ok) {
        toast.error("Save failed", { description: res.error });
        return;
      }
      toast.success("⚖️ Case raised");
      onOpenChange(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,920px)] flex-col gap-0 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>⚖️ Raise Case — FBA Recon v2</DialogTitle>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pt-2 pb-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
            <Info label="Used MSKU">{row.usedMsku}</Info>
            <Info label="Used FNSKU">{row.usedFnsku}</Info>
            <Info label="ASIN">{row.asin}</Info>
            <Info label="Actual In">{row.actualIn}</Info>
            <Info label="Computed End">{row.isMixedSku ? "—" : row.computedEnding}</Info>
            <Info label="Ledger End">{row.ledgerEnding ?? "—"}</Info>
            <Info label="Variance">{row.variance ?? "—"}</Info>
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</span>
              <GnrV2StatusBadge status={row.status} />
            </div>
          </div>

          <Field label="Case Reason *">
            <Select value={caseReason} onValueChange={setCaseReason}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— Select reason —" />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Units Claimed">
              <Input
                type="number"
                min={0}
                value={unitsClaimed}
                onChange={(e) => setUnitsClaimed(Number.parseInt(e.target.value) || 0)}
                className="text-center font-bold"
              />
            </Field>
            <Field label="Units Approved">
              <Input
                type="number"
                min={0}
                value={unitsApproved}
                onChange={(e) => setUnitsApproved(Number.parseInt(e.target.value) || 0)}
                className="text-center font-bold"
              />
            </Field>
            <Field label="Amount ($)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amountApproved}
                onChange={(e) => setAmountApproved(Number.parseFloat(e.target.value) || 0)}
                className="text-emerald-700"
              />
            </Field>
          </div>

          <Field label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Case ID (Amazon Case #)">
            <Input value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="e.g. 12345678901" />
          </Field>

          <Field label="Amazon Case URL">
            <Input
              type="url"
              value={caseUrl}
              onChange={(e) => setCaseUrl(e.target.value)}
              placeholder="https://sellercentral.amazon.com/cu/case-dashboard/view-case?caseID=…"
            />
          </Field>

          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Additional details…" />
          </Field>
        </div>

        <DialogFooter className="gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>⚖️ Raise Case</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-[11px] font-semibold">{children}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
