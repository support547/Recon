"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveRemovalCaseRaise } from "@/actions/removal-reconciliation";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CASE_TYPE_PRESETS } from "@/components/removal-reconciliation/shared/condition-button-grid";
import type { RemovalReconRow } from "@/lib/removal-reconciliation/types";

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

export function RaiseCaseModal({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: RemovalReconRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [caseReason, setCaseReason] = React.useState("Removal_Not_Received");
  const [unitsClaimed, setUnitsClaimed] = React.useState(1);
  const [amountClaimed, setAmountClaimed] = React.useState("");
  const [caseNotes, setCaseNotes] = React.useState("");
  const [caseId, setCaseId] = React.useState("");
  const [caseUrl, setCaseUrl] = React.useState("");
  const [issueDate, setIssueDate] = React.useState(todayIso());
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !row) return;
    const short = Math.max(0, row.expectedShipped - row.receivedQty);
    const defUnits = Math.max(
      1,
      short > 0 ? short : row.expectedShipped || row.actualShipped || 1,
    );
    setCaseReason(row.receivedQty <= 0 ? "Removal_Not_Received" : "Removal_Short_Received");
    setUnitsClaimed(defUnits);
    setAmountClaimed("");
    setCaseNotes("");
    setCaseId("");
    setCaseUrl("");
    setIssueDate(todayIso());
  }, [open, row]);

  if (!row) return null;

  const r = row;

  async function onSubmit() {
    const amt =
      typeof amountClaimed === "string"
        ? Number.parseFloat(amountClaimed.replace(/,/g, "") || "0")
        : Number(amountClaimed);
    const safeAmt = Number.isFinite(amt) ? amt : 0;

    setBusy(true);
    try {
      const res = await saveRemovalCaseRaise({
        orderId: r.orderId,
        fnsku: r.fnsku,
        msku: r.msku !== "—" ? r.msku : null,
        caseReason,
        unitsClaimed,
        amountClaimed: safeAmt,
        caseNotes: caseNotes.trim() ? caseNotes.trim() : null,
        caseId: caseId.trim() ? caseId.trim() : null,
        caseUrl: caseUrl.trim() ? caseUrl.trim() : null,
        issueDate,
      });
      if (!res.ok) {
        toast.error("Could not raise case", { description: res.error });
        return;
      }
      toast.success("Case raised — visible under Cases & Adjustments.");
      onOpenChange(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[95vw] overflow-y-auto sm:!max-w-3xl"
        style={{ maxWidth: "min(95vw, 880px)" }}
      >
        <DialogHeader>
          <DialogTitle>Raise removal case</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 text-sm">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-700">
            <div>
              <span className="text-muted-foreground">Order</span> {r.orderId}
            </div>
            <div>
              <span className="text-muted-foreground">MSKU</span> {r.msku}{" "}
              <span className="text-muted-foreground">· FNSKU</span> {r.fnsku}
            </div>
            <div>
              <span className="text-muted-foreground">Shipped</span>{" "}
              {r.actualShipped} · <span className="text-muted-foreground">Expected</span>{" "}
              {r.expectedShipped}
            </div>
          </div>

          <Field label="Case type">
            <Select value={caseReason} onValueChange={setCaseReason}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select case type" />
              </SelectTrigger>
              <SelectContent>
                {CASE_TYPE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Units claimed">
              <Input
                type="number"
                min={1}
                className="font-mono"
                value={unitsClaimed}
                onChange={(e) =>
                  setUnitsClaimed(Math.max(1, Number.parseInt(e.target.value, 10) || 1))
                }
              />
            </Field>
            <Field label="Amount claimed ($) optional">
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                className="font-mono"
                value={amountClaimed}
                onChange={(e) => setAmountClaimed(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Case ID (if already raised)">
              <Input
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                placeholder="Amazon case number"
              />
            </Field>
            <Field label="Amazon Case URL">
              <Input
                type="url"
                value={caseUrl}
                onChange={(e) => setCaseUrl(e.target.value)}
                placeholder="https://sellercentral.amazon.com/cu/case-dashboard/view-case?caseID=..."
              />
            </Field>
          </div>

          <Field label="Issue date">
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>

          <Field label="Notes">
            <Textarea
              rows={3}
              placeholder="Optional details for the case…"
              value={caseNotes}
              onChange={(e) => setCaseNotes(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void onSubmit()}>
            Raise case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
