"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AdjType, ReconType } from "@prisma/client";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import type { ManualAdjustmentRow } from "@/actions/cases";
import { createAdjustment, updateAdjustment } from "@/actions/cases";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toDatetimeLocalValue } from "@/lib/cases-ui";
import { ManualAdjustmentCreateSchema } from "@/lib/validations/cases";

type AdjustmentFormValues = Record<
  string,
  string | number | AdjType | ReconType | undefined | null
>;

function emptyAdjustmentForm(): AdjustmentFormValues {
  return {
    msku: "",
    asin: "",
    fnsku: "",
    title: "",
    reconType: ReconType.SHIPMENT,
    shipmentId: "",
    orderId: "",
    referenceId: "",
    adjType: AdjType.QUANTITY,
    qtyBefore: 0,
    qtyAdjusted: 0,
    reason: "",
    verifiedBy: "",
    sourceDoc: "",
    notes: "",
    adjDate: "",
    store: "",
    caseId: "",
  };
}

function rowToFormValues(row: ManualAdjustmentRow): AdjustmentFormValues {
  return {
    msku: row.msku ?? "",
    asin: row.asin ?? "",
    fnsku: row.fnsku ?? "",
    title: row.title ?? "",
    reconType: row.reconType,
    shipmentId: row.shipmentId ?? "",
    orderId: row.orderId ?? "",
    referenceId: row.referenceId ?? "",
    adjType: row.adjType,
    qtyBefore: row.qtyBefore,
    qtyAdjusted: row.qtyAdjusted,
    reason: row.reason ?? "",
    verifiedBy: row.verifiedBy ?? "",
    sourceDoc: row.sourceDoc ?? "",
    notes: row.notes ?? "",
    adjDate: toDatetimeLocalValue(row.adjDate),
    store: row.store ?? "",
    caseId: row.caseId ?? "",
  };
}

type AdjustmentFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  adjustment: ManualAdjustmentRow | null;
  onSaved: () => void;
};

export function AdjustmentFormModal({
  open,
  onOpenChange,
  mode,
  adjustment,
  onSaved,
}: AdjustmentFormModalProps) {
  const form = useForm({
    resolver: zodResolver(ManualAdjustmentCreateSchema),
    defaultValues: emptyAdjustmentForm() as never,
  });

  const qtyBefore = Number(useWatch({ control: form.control, name: "qtyBefore" }) ?? 0);
  const qtyAdjusted = Number(
    useWatch({ control: form.control, name: "qtyAdjusted" }) ?? 0,
  );
  const qtyAfterDisplay = qtyBefore + qtyAdjusted;

  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && adjustment) {
      form.reset(rowToFormValues(adjustment) as never);
    } else {
      form.reset(emptyAdjustmentForm() as never);
    }
  }, [open, mode, adjustment, form]);

  async function onSubmit(values: unknown) {
    if (mode === "edit" && adjustment) {
      const res = await updateAdjustment(adjustment.id, values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Adjustment updated.");
    } else {
      const res = await createAdjustment(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Adjustment created.");
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,920px)] flex-col gap-0 overflow-hidden sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit adjustment" : "New adjustment"}
          </DialogTitle>
          <DialogDescription>
            Manual quantity or workflow corrections tied to reconciliation.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="msku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>MSKU</FormLabel>
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
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
                        <Input {...field} value={String(field.value ?? "")} />
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
                        <Input {...field} value={String(field.value ?? "")} />
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
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reconType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recon type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(ReconType).map((rt) => (
                            <SelectItem key={rt} value={rt}>
                              {rt.replace(/_/g, " ")}
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
                  name="adjType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adjustment type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(AdjType).map((t) => (
                            <SelectItem key={t} value={t}>
                              {t.replace(/_/g, " ")}
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
                  name="qtyBefore"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qty before</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          value={
                            field.value === undefined || field.value === null
                              ? ""
                              : String(field.value)
                          }
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? 0
                                : Number.parseInt(e.target.value, 10),
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
                  name="qtyAdjusted"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qty adjusted</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          value={
                            field.value === undefined || field.value === null
                              ? ""
                              : String(field.value)
                          }
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? 0
                                : Number.parseInt(e.target.value, 10),
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormItem>
                  <FormLabel>Qty after</FormLabel>
                  <Input
                    readOnly
                    tabIndex={-1}
                    className="bg-muted font-mono tabular-nums"
                    value={qtyAfterDisplay.toLocaleString()}
                  />
                  <p className="text-xs text-muted-foreground">
                    Before + adjusted (saved on submit).
                  </p>
                </FormItem>

                <FormField
                  control={form.control}
                  name="adjDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adjustment date</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          {...field}
                          value={String(field.value ?? "")}
                        />
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
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="verifiedBy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verified by</FormLabel>
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sourceDoc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source document</FormLabel>
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="store"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Store</FormLabel>
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
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
                        <Textarea
                          {...field}
                          rows={4}
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shipmentId"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="orderId"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="referenceId"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="caseId"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? "Saving…"
                  : mode === "edit"
                    ? "Save changes"
                    : "Create adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
