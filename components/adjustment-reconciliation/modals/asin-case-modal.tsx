"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveAdjCaseAction } from "@/actions/adjustment-reconciliation";
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
import type { AdjLogRow, AdjPivotRow } from "@/lib/adjustment-reconciliation/types";

const REASON_OPTIONS = [
  "Lost — Warehouse (M / 5)",
  "Damaged — Warehouse (E)",
  "Mixed — Lost + Damaged",
  "Reimbursement reversal investigation",
  "Other",
];

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CLOSED", label: "Closed" },
];

export function AsinCaseModal({
  row,
  logRows,
  open,
  onOpenChange,
  onSaved,
}: {
  row: AdjPivotRow | null;
  logRows: AdjLogRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [caseId, setCaseId] = React.useState("");
  const [caseUrl, setCaseUrl] = React.useState("");
  const [claimType, setClaimType] = React.useState(REASON_OPTIONS[0]);
  const [unitsClaimed, setUnitsClaimed] = React.useState(0);
  const [amountClaimed, setAmountClaimed] = React.useState(0);
  const [status, setStatus] = React.useState("OPEN");
  const [notes, setNotes] = React.useState("");
  const [msku, setMsku] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);

  const mskuOptions = React.useMemo(() => {
    if (!row) return [] as { msku: string; fnsku: string }[];
    const map = new Map<string, string>();
    for (const r of logRows) {
      if (r.asin !== row.key) continue;
      if (!r.msku) continue;
      if (!map.has(r.msku)) map.set(r.msku, r.fnsku || "");
    }
    return Array.from(map.entries()).map(([msku, fnsku]) => ({ msku, fnsku }));
  }, [row, logRows]);

  const fnsku = React.useMemo(() => {
    return mskuOptions.find((o) => o.msku === msku)?.fnsku ?? "";
  }, [msku, mskuOptions]);

  React.useEffect(() => {
    if (!open || !row) return;
    setCaseId("");
    setCaseUrl("");
    setClaimType(REASON_OPTIONS[0]);
    const pending = row.openQty > 0
      ? row.openQty
      : Math.max(0, Math.abs(row.totalQty) - row.reimbQty);
    setUnitsClaimed(pending || Math.abs(row.totalQty) || 1);
    setAmountClaimed(0);
    setStatus("OPEN");
    setNotes("");
    setMsku("");
  }, [open, row]);

  if (!row) return null;

  async function onSubmit() {
    if (!row) return;
    if (!claimType) {
      toast.error("Select claim type");
      return;
    }
    if (unitsClaimed <= 0) {
      toast.error("Units claimed must be > 0");
      return;
    }
    setBusy(true);
    try {
      const res = await saveAdjCaseAction({
        msku: msku || null,
        fnsku: fnsku || null,
        asin: row.key,
        title: row.title || null,
        claimType,
        unitsClaimed,
        amountClaimed,
        caseId: caseId || null,
        caseUrl: caseUrl.trim() || null,
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
      <DialogContent
        className="max-h-[92vh] w-[95vw] overflow-y-auto sm:!max-w-3xl"
        style={{ maxWidth: "min(95vw, 880px)" }}
      >
        <DialogHeader>
          <DialogTitle>⚖️ Raise Case — Adjustment (ASIN)</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
          <Info label="ASIN">{row.key}</Info>
          <Info label="Title">{row.title || "—"}</Info>
          <Info label="Net Qty">
            <span className={row.totalQty < 0 ? "text-red-600" : row.totalQty > 0 ? "text-emerald-700" : ""}>
              {row.totalQty > 0 ? "+" : ""}
              {row.totalQty}
            </span>
          </Info>
          <Info label="Reimb Qty">{row.reimbQty}</Info>
          <Info label="Reimb $">{`$${row.reimbAmount.toFixed(2)}`}</Info>
          <Info label="Existing Cases">{row.caseCount}</Info>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Case ID (Amazon Case #)">
            <Input
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="e.g. 12345678901"
            />
          </Field>
          <Field label="Amazon Case URL">
            <Input
              type="url"
              value={caseUrl}
              onChange={(e) => setCaseUrl(e.target.value)}
              placeholder="https://sellercentral.amazon.com/..."
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="MSKU (optional)">
            <Select value={msku || "__none__"} onValueChange={(v) => setMsku(v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select MSKU" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {mskuOptions.map((o) => (
                  <SelectItem key={o.msku} value={o.msku}>
                    {o.msku}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="FNSKU (auto)">
            <Input value={fnsku} readOnly placeholder="—" className="bg-slate-50" />
          </Field>
        </div>

        <Field label="Claim Type *">
          <Select value={claimType} onValueChange={setClaimType}>
            <SelectTrigger className="w-full">
              <SelectValue />
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
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            ⚖️ Raise Case
          </Button>
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
