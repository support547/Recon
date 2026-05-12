"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  saveInventoryAdjustmentAction,
  saveInventoryCaseAction,
} from "@/actions/full-reconciliation";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FullStatusBadge } from "@/components/full-reconciliation/shared/status-badge";
import type { FullReconRow } from "@/lib/full-reconciliation/types";

const CASE_TYPES = [
  { value: "Lost", label: "Lost" },
  { value: "Damaged", label: "Damaged" },
  { value: "Overcharged", label: "Overcharged Fees" },
  { value: "Missing Units", label: "Missing Units" },
  { value: "Other", label: "Other" },
];

const ADJ_REASONS = [
  { value: "Found", label: "Found (inventory located)" },
  { value: "Lost", label: "Lost / Write-off" },
  { value: "Correction", label: "Correction" },
  { value: "Damage", label: "Damage" },
  { value: "Other", label: "Other" },
];

export function ActionModal({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: FullReconRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [tab, setTab] = React.useState<"case" | "adj">("case");
  const [caseType, setCaseType] = React.useState("Lost");
  const [caseQty, setCaseQty] = React.useState(0);
  const [caseAmt, setCaseAmt] = React.useState(0);
  const [caseNotes, setCaseNotes] = React.useState("");
  const [adjQty, setAdjQty] = React.useState(0);
  const [adjReason, setAdjReason] = React.useState("Found");
  const [adjNotes, setAdjNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !row) return;
    setTab("case");
    setCaseType(row.reconStatus === "Take Action" ? "Missing Units" : "Lost");
    const variance = row.fbaEndingBalance !== null ? row.fbaEndingBalance - row.endingBalance : 0;
    const suggested = Math.abs(variance) || row.shortageQty || 0;
    setCaseQty(suggested);
    setCaseAmt(0);
    setCaseNotes("");
    setAdjQty(suggested);
    setAdjReason("Correction");
    setAdjNotes("");
  }, [open, row]);

  if (!row) return null;

  async function onSubmitCase() {
    if (!row) return;
    setBusy(true);
    try {
      const res = await saveInventoryCaseAction({
        msku: row.msku,
        fnsku: row.fnsku === "—" ? null : row.fnsku,
        asin: row.asin || null,
        title: row.title || null,
        caseType,
        unitsClaimed: caseQty,
        amountClaimed: caseAmt,
        notes: caseNotes || null,
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

  async function onSubmitAdj() {
    if (!row) return;
    if (adjQty === 0) {
      toast.error("Enter a non-zero quantity");
      return;
    }
    setBusy(true);
    try {
      const res = await saveInventoryAdjustmentAction({
        msku: row.msku,
        fnsku: row.fnsku === "—" ? null : row.fnsku,
        asin: row.asin || null,
        title: row.title || null,
        qtyAdjusted: adjQty,
        reason: adjReason,
        notes: adjNotes || null,
      });
      if (!res.ok) {
        toast.error("Save failed", { description: res.error });
        return;
      }
      toast.success("🔧 Adjustment saved");
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
          <DialogTitle>Action — Full Inventory Recon</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
          <Info label="MSKU">{row.msku}</Info>
          <Info label="FNSKU">{row.fnsku}</Info>
          <Info label="ASIN">{row.asin}</Info>
          <Info label="Ending Bal.">{row.endingBalance}</Info>
          <Info label="FBA Bal.">{row.fbaEndingBalance ?? "—"}</Info>
          <div className="flex items-center gap-2 py-1">
            <span className="text-[10px] uppercase text-muted-foreground">Status</span>
            <FullStatusBadge status={row.reconStatus} />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "case" | "adj")} className="gap-3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="case" className="text-xs">⚖️ Raise Case</TabsTrigger>
            <TabsTrigger value="adj" className="text-xs">🔧 Manual Adjustment</TabsTrigger>
          </TabsList>

          <TabsContent value="case" className="space-y-3">
            <Field label="Case Type">
              <Select value={caseType} onValueChange={setCaseType}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASE_TYPES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Units (Qty)">
                <Input
                  type="number"
                  value={caseQty}
                  onChange={(e) => setCaseQty(Number.parseInt(e.target.value) || 0)}
                  className="text-center font-bold"
                />
              </Field>
              <Field label="Amount ($)">
                <Input
                  type="number"
                  step="0.01"
                  value={caseAmt}
                  onChange={(e) => setCaseAmt(Number.parseFloat(e.target.value) || 0)}
                  className="text-emerald-700"
                />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={caseNotes} onChange={(e) => setCaseNotes(e.target.value)} rows={3} placeholder="Case details…" />
            </Field>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={() => void onSubmitCase()} disabled={busy}>Raise Case</Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="adj" className="space-y-3">
            <Field label="Adjustment Qty (+ to add, − to remove)">
              <Input
                type="number"
                value={adjQty}
                onChange={(e) => setAdjQty(Number.parseInt(e.target.value) || 0)}
                placeholder="e.g. -2 or +3"
                className="text-center font-bold"
              />
            </Field>
            <Field label="Reason">
              <Select value={adjReason} onValueChange={setAdjReason}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ADJ_REASONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Notes">
              <Textarea value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} rows={3} placeholder="Reason for adjustment…" />
            </Field>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={() => void onSubmitAdj()} disabled={busy}>Save Adjustment</Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
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
