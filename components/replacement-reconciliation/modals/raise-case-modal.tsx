"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveReplaceCaseAction } from "@/actions/replacement-reconciliation";
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
import { ReplacementStatusBadge } from "@/components/replacement-reconciliation/shared/status-badge";
import type { ReplacementReconRow } from "@/lib/replacement-reconciliation/types";

const REASON_OPTIONS = [
  "Replacement not returned by customer",
  "Replacement shipped but no reimbursement",
  "Original order missing/lost",
  "Customer kept both items",
  "Damaged in transit",
  "Other",
];

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CLOSED", label: "Closed" },
];

export function RaiseCaseModal({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: ReplacementReconRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [caseId, setCaseId] = React.useState("");
  const [caseReason, setCaseReason] = React.useState("");
  const [unitsClaimed, setUnitsClaimed] = React.useState(1);
  const [amountClaimed, setAmountClaimed] = React.useState(0);
  const [status, setStatus] = React.useState("OPEN");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !row) return;
    setCaseId("");
    setCaseReason(
      row.status === "TAKE_ACTION"
        ? "Replacement not returned by customer"
        : row.status === "PARTIAL"
          ? "Replacement shipped but no reimbursement"
          : "",
    );
    const pending = Math.max(0, row.quantity - row.returnQty - row.effectiveReimbQty);
    setUnitsClaimed(pending || row.quantity || 1);
    setAmountClaimed(0);
    setStatus("OPEN");
    setNotes("");
  }, [open, row]);

  if (!row) return null;

  const primaryOrder = row.replacementOrderId !== "—" ? row.replacementOrderId : row.originalOrderId;

  async function onSubmit() {
    if (!row) return;
    if (!caseReason) {
      toast.error("Please select a case reason");
      return;
    }
    if (!primaryOrder || primaryOrder === "—") {
      toast.error("Order ID missing");
      return;
    }
    setBusy(true);
    try {
      const res = await saveReplaceCaseAction({
        orderId: primaryOrder,
        msku: row.msku,
        asin: row.asin === "—" ? null : row.asin,
        caseId: caseId || null,
        caseReason,
        unitsClaimed,
        amountClaimed,
        status,
        notes: notes || null,
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
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>⚖️ Raise Case — Replacement</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
          <Info label="Replacement Order">{row.replacementOrderId}</Info>
          <Info label="Original Order">{row.originalOrderId}</Info>
          <Info label="MSKU">{row.msku}</Info>
          <Info label="ASIN">{row.asin}</Info>
          <Info label="Replacement Qty">{row.quantity}</Info>
          <Info label="Returned">{row.returnQty}</Info>
          <Info label="Reimbursed (Eff.)">{row.effectiveReimbQty}</Info>
          <div className="flex items-center gap-2 py-1">
            <span className="text-[10px] uppercase text-muted-foreground">Status</span>
            <ReplacementStatusBadge status={row.status} />
          </div>
        </div>

        <Field label="Case ID (Amazon Case #)">
          <Input value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="e.g. 12345678901" />
        </Field>

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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Units Claimed">
            <Input
              type="number"
              min={0}
              value={unitsClaimed}
              onChange={(e) => setUnitsClaimed(Number.parseInt(e.target.value) || 0)}
              className="text-center font-bold"
            />
          </Field>
          <Field label="Amount Claimed ($)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amountClaimed}
              onChange={(e) => setAmountClaimed(Number.parseFloat(e.target.value) || 0)}
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

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Additional details…" />
        </Field>

        <DialogFooter className="gap-2">
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
