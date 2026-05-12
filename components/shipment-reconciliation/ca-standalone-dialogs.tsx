"use client";

import * as React from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import type { CaseTrackerRow, ManualAdjustmentRow } from "@/actions/cases";
import {
  saveShipmentCaStandaloneAdjustment,
  saveShipmentCaStandaloneCase,
} from "@/actions/shipment-reconciliation";
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
import {
  adjustmentLegacyAdjType,
  displayCaseStatusLabel,
  formatIsoDate,
  reconTypeToFormValue,
} from "@/lib/shipment-reconciliation-display";
import {
  shipmentCaStandaloneAdjustmentSchema,
  shipmentCaStandaloneCaseSchema,
  type ShipmentCaStandaloneAdjustmentInput,
  type ShipmentCaStandaloneCaseInput,
} from "@/lib/validations/shipment-reconciliation";

const RECON_OPTS = [
  { v: "shipment", l: "Shipment" },
  { v: "removal", l: "Removal" },
  { v: "return", l: "Return" },
  { v: "fc_transfer", l: "FC Transfer" },
  { v: "fba_balance", l: "FBA Balance" },
  { v: "other", l: "Other" },
] as const;

export function CaStandaloneCaseDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CaseTrackerRow | null;
  onSaved: () => Promise<void> | void;
}) {
  const form = useForm<ShipmentCaStandaloneCaseInput>({
    resolver:
      standardSchemaResolver(shipmentCaStandaloneCaseSchema) as Resolver<ShipmentCaStandaloneCaseInput>,
    defaultValues: {
      recon_type: "shipment",
      status: "pending",
      case_reason: "Lost_Inbound",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        id: editing.id,
        msku: editing.msku ?? "",
        asin: editing.asin ?? "",
        fnsku: editing.fnsku ?? "",
        title: editing.title ?? "",
        recon_type: reconTypeToFormValue(editing.reconType),
        shipment_id: editing.shipmentId ?? "",
        order_id: editing.orderId ?? "",
        case_reason: editing.caseReason ?? "Lost_Inbound",
        units_claimed: editing.unitsClaimed,
        units_approved: editing.unitsApproved,
        amount_claimed: editing.amountClaimed ?? null,
        amount_approved: editing.amountApproved ?? null,
        case_id: editing.referenceId ?? null,
        status: displayCaseStatusLabel(editing) as ShipmentCaStandaloneCaseInput["status"],
        issue_date: formatIsoDate(editing.issueDate) !== "—" ? formatIsoDate(editing.issueDate) : "",
        raised_date:
          formatIsoDate(editing.raisedDate) !== "—"
            ? formatIsoDate(editing.raisedDate)
            : "",
        resolved_date:
          formatIsoDate(editing.resolvedDate) !== "—"
            ? formatIsoDate(editing.resolvedDate)
            : "",
        notes: editing.notes ?? "",
      });
    } else {
      form.reset({
        recon_type: "shipment",
        status: "pending",
        case_reason: "Lost_Inbound",
        msku: "",
        units_claimed: 0,
        units_approved: 0,
      });
    }
  }, [open, editing, form]);

  async function onSubmit(values: ShipmentCaStandaloneCaseInput) {
    const res = await saveShipmentCaStandaloneCase(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("✅ Case saved!");
    onOpenChange(false);
    await onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Case" : "Add Case"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Case Tracker — Shipment Reconciliation
          </p>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="msku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>MSKU *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="asin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ASIN</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fnsku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>FNSKU</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="recon_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recon Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RECON_OPTS.map((o) => (
                        <SelectItem key={o.v} value={o.v}>
                          {o.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipment_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shipment ID</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="FBA..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="case_reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Case Reason</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Lost_Inbound">Lost_Inbound</SelectItem>
                      <SelectItem value="Damaged_Inbound">Damaged_Inbound</SelectItem>
                      <SelectItem value="ShortReceived">Short Received</SelectItem>
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
              control={form.control}
              name="units_claimed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Units Claimed</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="units_approved"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Units Approved</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
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
              control={form.control}
              name="amount_approved"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount Approved ($)</FormLabel>
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
              control={form.control}
              name="case_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Case ID</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Amazon case #"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
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
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="raised">Raised</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
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
              control={form.control}
              name="raised_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raised Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="resolved_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resolved Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="order_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order ID</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Notes..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save Case</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function CaStandaloneAdjustmentDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: ManualAdjustmentRow | null;
  onSaved: () => Promise<void> | void;
}) {
  const form = useForm<ShipmentCaStandaloneAdjustmentInput>({
    resolver:
      standardSchemaResolver(
        shipmentCaStandaloneAdjustmentSchema,
      ) as Resolver<ShipmentCaStandaloneAdjustmentInput>,
    defaultValues: {
      recon_type: "shipment",
      adj_type: "found",
      qty_before: 0,
      qty_adjusted: 0,
      reason: "",
    },
  });

  const qb = form.watch("qty_before");
  const qa = form.watch("qty_adjusted");
  const qtyAfter = (Number(qb) || 0) + (Number(qa) || 0);

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        id: editing.id,
        msku: editing.msku ?? "",
        asin: editing.asin ?? "",
        fnsku: editing.fnsku ?? "",
        title: editing.title ?? "",
        recon_type: reconTypeToFormValue(editing.reconType),
        adj_type:
          adjustmentLegacyAdjType(editing) as ShipmentCaStandaloneAdjustmentInput["adj_type"],
        shipment_id: editing.shipmentId ?? "",
        qty_before: editing.qtyBefore,
        qty_adjusted: editing.qtyAdjusted,
        reason: editing.reason ?? "",
        verified_by: editing.verifiedBy ?? "",
        source_doc: editing.sourceDoc ?? "",
        notes: editing.notes ?? "",
        adj_date:
          formatIsoDate(editing.adjDate) !== "—"
            ? formatIsoDate(editing.adjDate)
            : "",
      });
    } else {
      form.reset({
        recon_type: "shipment",
        adj_type: "found",
        msku: "",
        qty_before: 0,
        qty_adjusted: 0,
        reason: "",
      });
    }
  }, [open, editing, form]);

  async function onSubmit(values: ShipmentCaStandaloneAdjustmentInput) {
    const res = await saveShipmentCaStandaloneAdjustment(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("✅ Adjustment saved!");
    onOpenChange(false);
    await onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Adjustment" : "Add Adjustment"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Manual Adjustments — Inventory Reconciliation
          </p>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="msku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>MSKU *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="asin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ASIN</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fnsku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>FNSKU</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="recon_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recon Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RECON_OPTS.map((o) => (
                        <SelectItem key={o.v} value={o.v}>
                          {o.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="adj_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adj Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="found">Found</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                      <SelectItem value="damaged">Damaged</SelectItem>
                      <SelectItem value="correction">Correction</SelectItem>
                      <SelectItem value="count_adjustment">
                        Count Adjustment
                      </SelectItem>
                      <SelectItem value="donated">Donated</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipment_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shipment ID</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="qty_before"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qty Before</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="qty_adjusted"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qty Adjusted (+/-)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <Label>Qty After (auto)</Label>
              <Input readOnly className="bg-slate-50" value={qtyAfter} />
            </div>
            <FormField
              control={form.control}
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
              control={form.control}
              name="verified_by"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verified By</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="source_doc"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source Doc</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Reference doc..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Reason / Root Cause *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Reason for adjustment..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save Adjustment</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
