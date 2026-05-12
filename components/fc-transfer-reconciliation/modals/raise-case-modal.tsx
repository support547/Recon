"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveFcCaseAction } from "@/actions/fc-transfer-reconciliation";
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
import { ActionStatusBadge } from "@/components/fc-transfer-reconciliation/shared/action-status-badge";
import type { FcAnalysisRow } from "@/lib/fc-transfer-reconciliation/types";

const REASON_OPTIONS = [
  "FC Transfer Discrepancy — units sent but not received",
  "Units missing during transfer between fulfillment centers",
  "Damaged in transit between FCs",
  "Lost in warehouse transfer",
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
  row: FcAnalysisRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  if (!row) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>⚖️ Raise Case — FC Transfer</DialogTitle>
        </DialogHeader>
        <ModalBody
          key={`${row.msku}|${row.fnsku}|${open ? "o" : "c"}`}
          row={row}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

function ModalBody({
  row,
  onClose,
  onSaved,
}: {
  row: FcAnalysisRow;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [caseId, setCaseId] = React.useState("");
  const [caseReason, setCaseReason] = React.useState(REASON_OPTIONS[0]);
  const [unitsClaimed, setUnitsClaimed] = React.useState(Math.abs(row.netQty) || 1);
  const [amountClaimed, setAmountClaimed] = React.useState(0);
  const [status, setStatus] = React.useState("OPEN");
  const [notes, setNotes] = React.useState(
    `Imbalance since: ${row.imbalanceStart || "unknown"}. Days pending: ${row.daysPending}`,
  );
  const [busy, setBusy] = React.useState(false);

  async function onSubmit() {
    if (!caseReason) {
      toast.error("Please select a case reason");
      return;
    }
    setBusy(true);
    try {
      const res = await saveFcCaseAction({
        msku: row.msku,
        fnsku: row.fnsku || null,
        asin: row.asin || null,
        title: row.title || null,
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
      onClose();
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
        <Info label="MSKU">{row.msku}</Info>
        <Info label="FNSKU">{row.fnsku || "—"}</Info>
        <Info label="ASIN">{row.asin || "—"}</Info>
        <Info label="Net Qty">
          <span className={row.netQty < 0 ? "text-red-600" : "text-emerald-700"}>
            {row.netQty > 0 ? "+" : ""}
            {row.netQty}
          </span>
        </Info>
        <Info label="Days Pending">{row.daysPending}</Info>
        <div className="flex items-center gap-2 py-1">
          <span className="text-[10px] uppercase text-muted-foreground">Status</span>
          <ActionStatusBadge status={row.actionStatus} />
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
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
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
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Additional details…" />
      </Field>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => void onSubmit()} disabled={busy}>
          ⚖️ Raise Case
        </Button>
      </DialogFooter>
    </>
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
