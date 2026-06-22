"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  upsertInboundShipment,
  type InboundShipmentRow,
} from "@/actions/inbound-recon";
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
import { InboundShipmentUpsertSchema } from "@/lib/validations/inbound-recon";

type FormValues = {
  shipmentId: string;
  manualProcFee: string;
  placementFee: string;
  partneredCarrier: string;
};

function emptyForm(): FormValues {
  return {
    shipmentId: "",
    manualProcFee: "",
    placementFee: "",
    partneredCarrier: "",
  };
}

function rowToForm(row: InboundShipmentRow): FormValues {
  return {
    shipmentId: row.shipmentId,
    manualProcFee: row.manualProcFee ?? "",
    placementFee: row.placementFee ?? "",
    partneredCarrier: row.partneredCarrier ?? "",
  };
}

type InboundReconFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  item: InboundShipmentRow | null;
  onSaved: () => void;
};

export function InboundReconFormModal({
  open,
  onOpenChange,
  mode,
  item,
  onSaved,
}: InboundReconFormModalProps) {
  const form = useForm({
    resolver: zodResolver(InboundShipmentUpsertSchema),
    defaultValues: emptyForm() as never,
  });

  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && item) {
      form.reset(rowToForm(item) as never);
    } else {
      form.reset(emptyForm() as never);
    }
  }, [open, mode, item, form]);

  async function onSubmit(values: unknown) {
    const payload =
      mode === "edit" && item
        ? { ...(values as object), id: item.id }
        : (values as object);
    const res = await upsertInboundShipment(payload);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(mode === "edit" ? "Shipment updated." : "Shipment created.");
    onOpenChange(false);
    onSaved();
  }

  const title =
    mode === "edit" ? "Edit inbound shipment" : "New inbound shipment";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Manual entry of FBA inbound shipment fees. Phase 1: no
            reconciliation yet.
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
                  name="shipmentId"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>
                        Shipment ID <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="FBA197CMP0XH"
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="manualProcFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Manual processing fee
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="placementFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Placement fee</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="partneredCarrier"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Partnered carrier cost</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                      <FormMessage />
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
                    : "Add shipment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
