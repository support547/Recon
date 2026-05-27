"use client";

import * as React from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import { saveShipmentReconAdjustmentAction, saveShipmentReconCaseAction } from "@/actions/shipment-reconciliation";
import { createWrongLabelAdjustment } from "@/actions/adjustments";
import { uploadCaseAttachment } from "@/actions/case-attachments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ShipmentReconRow } from "@/lib/shipment-reconciliation-logic";
import {
  shipmentReconAdjActionSchema,
  shipmentReconCaseActionSchema,
  type ShipmentReconAdjActionInput,
  type ShipmentReconCaseActionInput,
} from "@/lib/validations/shipment-reconciliation";

function todayInput(): string {
  return new Date().toISOString().split("T")[0];
}

export function ReconActionDialog({
  row,
  open,
  onOpenChange,
  preselect,
  onSaved,
}: {
  row: ShipmentReconRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preselect?: "case" | "adj" | null;
  onSaved: () => Promise<void> | void;
}) {
  const [step, setStep] = React.useState<null | "case" | "adj">(null);

  React.useEffect(() => {
    if (!open) {
      setStep(null);
      return;
    }
    if (preselect) setStep(preselect);
    else setStep(null);
  }, [open, preselect]);

  const caseForm = useForm<ShipmentReconCaseActionInput>({
    resolver:
      standardSchemaResolver(shipmentReconCaseActionSchema) as Resolver<ShipmentReconCaseActionInput>,
    defaultValues: {
      case_reason: "Lost_Inbound",
      status: "pending",
      units_claimed: 0,
      issue_date: todayInput(),
      notes: "",
      case_id: null,
      amount_claimed: null,
      case_url: null,
      attachment_url: null,
    },
  });

  const adjForm = useForm<ShipmentReconAdjActionInput>({
    resolver:
      standardSchemaResolver(shipmentReconAdjActionSchema) as Resolver<ShipmentReconAdjActionInput>,
    defaultValues: {
      adj_type: "found",
      qty_before: 0,
      qty_adjusted: 0,
      reason: "",
      verified_by: "",
      notes: "",
      adj_date: todayInput(),
    },
  });

  React.useEffect(() => {
    if (!row || !open) return;
    caseForm.reset({
      msku: row.msku,
      asin: row.asin,
      fnsku: row.fnsku,
      title: row.title,
      shipment_id: row.shipment_id,
      case_reason: "Lost_Inbound",
      units_claimed: row.pending,
      amount_claimed: null,
      case_id: null,
      status: "pending",
      issue_date: todayInput(),
      notes: "",
      case_url: null,
      attachment_url: null,
    });
    adjForm.reset({
      msku: row.msku,
      asin: row.asin,
      fnsku: row.fnsku,
      title: row.title,
      shipment_id: row.shipment_id,
      adj_type: "found",
      qty_before: row.received_qty,
      qty_adjusted: 0,
      reason: "",
      verified_by: "",
      notes: "",
      adj_date: todayInput(),
    });
  }, [row, open, caseForm, adjForm]);

  const qb = adjForm.watch("qty_before");
  const qa = adjForm.watch("qty_adjusted");
  const adjType = adjForm.watch("adj_type");
  const qtyAfter = (Number(qb) || 0) + (Number(qa) || 0);
  const isWrongLabel = adjType === "wrong_label";
  const [receivedAsFnsku, setReceivedAsFnsku] = React.useState("");
  const [uploadingPdf, setUploadingPdf] = React.useState(false);
  const [attachmentName, setAttachmentName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setReceivedAsFnsku("");
      setAttachmentName(null);
      setUploadingPdf(false);
    }
  }, [open]);

  async function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadCaseAttachment(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      caseForm.setValue("attachment_url", res.url, { shouldDirty: true });
      setAttachmentName(res.filename);
      toast.success("📎 PDF attached");
    } finally {
      setUploadingPdf(false);
    }
  }

  React.useEffect(() => {
    if (isWrongLabel) {
      if (!adjForm.getValues("reason")) {
        adjForm.setValue("reason", "WRONG_LABEL");
      }
    }
  }, [isWrongLabel, adjForm]);

  async function submitCase(values: ShipmentReconCaseActionInput) {
    if (!row) return;
    const payload = {
      ...values,
      msku: row.msku,
      asin: row.asin,
      fnsku: row.fnsku,
      title: row.title,
      shipment_id: row.shipment_id,
    };
    const res = await saveShipmentReconCaseAction(payload);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("✅ Case saved! Recon table updated.");
    onOpenChange(false);
    await onSaved();
  }

  async function submitAdj(values: ShipmentReconAdjActionInput) {
    if (!row) return;
    if (values.adj_type === "wrong_label") {
      const qty = Math.abs(Number(values.qty_adjusted) || 0);
      if (!receivedAsFnsku.trim()) {
        toast.error("Received-as FNSKU is required.");
        return;
      }
      if (qty <= 0) {
        toast.error("Quantity must be at least 1.");
        return;
      }
      const res = await createWrongLabelAdjustment({
        shipmentId: row.shipment_id,
        msku: row.msku,
        expectedFnsku: row.fnsku,
        receivedAsFnsku: receivedAsFnsku.trim(),
        quantity: qty,
        notes: values.notes?.trim() || undefined,
        asin: row.asin ?? null,
        title: row.title ?? null,
        skipCase: true,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("⚠ Wrong-label adjustment recorded");
      onOpenChange(false);
      await onSaved();
      return;
    }
    const payload = {
      ...values,
      msku: row.msku,
      asin: row.asin,
      fnsku: row.fnsku,
      title: row.title,
      shipment_id: row.shipment_id,
    };
    const res = await saveShipmentReconAdjustmentAction(payload);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("✅ Adjustment saved! Recon table updated.");
    onOpenChange(false);
    await onSaved();
  }

  const title =
    step === "case"
      ? "📋 Raise Amazon Case"
      : step === "adj"
        ? "🔧 Manual Adjustment"
        : "⚡ Take Action";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {row ? `${row.msku} · ${row.shipment_id}` : ""}
          </p>
        </DialogHeader>

        {row ? (
          <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">MSKU</span>
              <span className="ml-2 truncate font-mono font-semibold" title={row.msku}>{row.msku}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">FNSKU</span>
              <span className="font-mono font-semibold">{row.fnsku}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipment</span>
              <span className="font-mono font-semibold">{row.shipment_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ship Date</span>
              <span className="font-mono font-semibold">{row.ship_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipped</span>
              <span className="font-mono font-semibold">{row.shipped_qty}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Received</span>
              <span className="font-mono font-semibold">{row.received_qty}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shortage</span>
              <span className="font-mono font-semibold text-red-600">-{row.shortage}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reimbursed</span>
              <span className="font-mono font-semibold text-emerald-600">
                {row.reimb_qty > 0 ? `+${row.reimb_qty}` : "—"}
              </span>
            </div>
            <div className="col-span-2 mt-1 flex justify-between border-t border-blue-200 pt-1.5">
              <span className="text-muted-foreground">Pending Units</span>
              <span className="font-mono font-semibold text-red-600">
                {row.pending} units need action
              </span>
            </div>
          </div>
        ) : null}

        {!step ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-lg border-2 border-slate-200 p-4 text-center transition hover:border-blue-400 hover:bg-blue-50"
              onClick={() => setStep("case")}
            >
              <div className="mb-1 text-2xl">📋</div>
              <div className="text-sm font-bold">Raise Case</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                File a claim with Amazon for missing/lost units
              </div>
            </button>
            <button
              type="button"
              className="rounded-lg border-2 border-slate-200 p-4 text-center transition hover:border-blue-400 hover:bg-blue-50"
              onClick={() => setStep("adj")}
            >
              <div className="mb-1 text-2xl">🔧</div>
              <div className="text-sm font-bold">Manual Adjustment</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Log an internal inventory correction
              </div>
            </button>
          </div>
        ) : null}

        {step === "case" ? (
          <Form {...caseForm}>
            <form
              onSubmit={caseForm.handleSubmit(submitCase)}
              className="space-y-3"
            >
              <FormField
                control={caseForm.control}
                name="case_reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Case Reason *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Lost_Inbound">
                          Lost_Inbound (Lost during shipment to FBA)
                        </SelectItem>
                        <SelectItem value="Damaged_Inbound">
                          Damaged_Inbound (Damaged on arrival)
                        </SelectItem>
                        <SelectItem value="ShortReceived">
                          Short Received (FBA received fewer than sent)
                        </SelectItem>
                        <SelectItem value="MissingFromInbound">
                          Missing from Inbound
                        </SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={caseForm.control}
                name="units_claimed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Units to Claim *</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={caseForm.control}
                name="amount_claimed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount Claimed ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? null : e.target.value,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={caseForm.control}
                name="case_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Case ID (if already raised)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="Amazon case number"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={caseForm.control}
                name="case_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amazon Case URL</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? null : e.target.value,
                          )
                        }
                        placeholder="https://sellercentral.amazon.com/cu/case-dashboard/view-case?caseID=..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Attachment (PDF)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handlePdfChange}
                    disabled={uploadingPdf}
                    className="text-xs"
                  />
                  {uploadingPdf ? (
                    <span className="text-xs text-muted-foreground">Uploading…</span>
                  ) : attachmentName ? (
                    <a
                      href={caseForm.getValues("attachment_url") ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-xs text-blue-600 underline"
                      title={attachmentName}
                    >
                      {attachmentName}
                    </a>
                  ) : null}
                  {attachmentName ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        caseForm.setValue("attachment_url", null, { shouldDirty: true });
                        setAttachmentName(null);
                      }}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
              <FormField
                control={caseForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">
                          Pending (not raised yet)
                        </SelectItem>
                        <SelectItem value="raised">
                          Raised (submitted to Amazon)
                        </SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={caseForm.control}
                name="issue_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Issue Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={caseForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Additional notes..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    preselect ? onOpenChange(false) : setStep(null)
                  }
                >
                  Cancel
                </Button>
                <Button type="submit">Save & Add to Table</Button>
              </DialogFooter>
            </form>
          </Form>
        ) : null}

        {step === "adj" ? (
          <Form {...adjForm}>
            <form
              onSubmit={adjForm.handleSubmit(submitAdj)}
              className="space-y-3"
            >
              <FormField
                control={adjForm.control}
                name="adj_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjustment Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="found">
                          Found (units located in warehouse)
                        </SelectItem>
                        <SelectItem value="lost">
                          Lost (units confirmed missing)
                        </SelectItem>
                        <SelectItem value="damaged">
                          Damaged (units damaged)
                        </SelectItem>
                        <SelectItem value="correction">
                          Correction (data entry fix)
                        </SelectItem>
                        <SelectItem value="count_adjustment">
                          Count Adjustment (physical count)
                        </SelectItem>
                        <SelectItem value="donated">
                          Donated / Written off
                        </SelectItem>
                        <SelectItem value="wrong_label">
                          ⚠ Wrong Label (received under different FNSKU)
                        </SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {isWrongLabel ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-[11px]">Expected FNSKU</Label>
                    <Input
                      value={row?.fnsku ?? ""}
                      readOnly
                      className="h-9 bg-slate-50 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px]">Received as FNSKU *</Label>
                    <Input
                      value={receivedAsFnsku}
                      onChange={(e) => setReceivedAsFnsku(e.target.value)}
                      placeholder="X004YWCZ77"
                      className="h-9 font-mono text-xs uppercase"
                    />
                  </div>
                </div>
              ) : null}
              <FormField
                control={adjForm.control}
                name="qty_adjusted"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qty Adjusted (+/-) *</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} placeholder="+5 or -3" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isWrongLabel ? (
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={adjForm.control}
                    name="qty_before"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qty Before</FormLabel>
                        <FormControl>
                          <Input type="number" readOnly className="bg-slate-50" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-2">
                    <Label>Qty After (auto)</Label>
                    <Input readOnly className="bg-slate-50" value={qtyAfter} />
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={adjForm.control}
                  name="adj_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adj Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={adjForm.control}
                  name="verified_by"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verified By</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Your name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {!isWrongLabel ? (
                <FormField
                  control={adjForm.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason / Root Cause *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Why is this adjustment being made?"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={adjForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Additional notes..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    preselect ? onOpenChange(false) : setStep(null)
                  }
                >
                  Cancel
                </Button>
                <Button type="submit">Save & Add to Table</Button>
              </DialogFooter>
            </form>
          </Form>
        ) : null}

        {!step ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
