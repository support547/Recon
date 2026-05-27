"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CaseStatus, ReconType } from "@prisma/client";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { CaseTrackerRow } from "@/actions/cases";
import { createCase, updateCase } from "@/actions/cases";
import { uploadCaseAttachment } from "@/actions/case-attachments";
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
import { CaseTrackerCreateSchema } from "@/lib/validations/cases";

type CaseFormValues = Record<
  string,
  string | number | CaseStatus | ReconType | undefined | null
>;

function emptyCaseForm(): CaseFormValues {
  return {
    msku: "",
    asin: "",
    fnsku: "",
    title: "",
    reconType: ReconType.SHIPMENT,
    shipmentId: "",
    orderId: "",
    referenceId: "",
    caseReason: "",
    unitsClaimed: 0,
    unitsApproved: 0,
    amountClaimed: "",
    amountApproved: "",
    currency: "USD",
    status: CaseStatus.OPEN,
    issueDate: "",
    raisedDate: "",
    resolvedDate: "",
    notes: "",
    store: "",
    caseUrl: "",
    attachmentUrl: "",
  };
}

function rowToFormValues(row: CaseTrackerRow): CaseFormValues {
  return {
    msku: row.msku ?? "",
    asin: row.asin ?? "",
    fnsku: row.fnsku ?? "",
    title: row.title ?? "",
    reconType: row.reconType,
    shipmentId: row.shipmentId ?? "",
    orderId: row.orderId ?? "",
    referenceId: row.referenceId ?? "",
    caseReason: row.caseReason ?? "",
    unitsClaimed: row.unitsClaimed,
    unitsApproved: row.unitsApproved,
    amountClaimed: row.amountClaimed ?? "",
    amountApproved: row.amountApproved ?? "",
    currency: row.currency ?? "USD",
    status: row.status,
    issueDate: toDatetimeLocalValue(row.issueDate),
    raisedDate: toDatetimeLocalValue(row.raisedDate),
    resolvedDate: toDatetimeLocalValue(row.resolvedDate),
    notes: row.notes ?? "",
    store: row.store ?? "",
    caseUrl: row.caseUrl ?? "",
    attachmentUrl: row.attachmentUrl ?? "",
  };
}

type CaseFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  caseRow: CaseTrackerRow | null;
  onSaved: () => void;
};

export function CaseFormModal({
  open,
  onOpenChange,
  mode,
  caseRow,
  onSaved,
}: CaseFormModalProps) {
  const form = useForm({
    resolver: zodResolver(CaseTrackerCreateSchema),
    defaultValues: emptyCaseForm() as never,
  });

  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && caseRow) {
      form.reset(rowToFormValues(caseRow) as never);
    } else {
      form.reset(emptyCaseForm() as never);
    }
  }, [open, mode, caseRow, form]);

  async function onSubmit(values: unknown) {
    if (mode === "edit" && caseRow) {
      const res = await updateCase(caseRow.id, values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Case updated.");
    } else {
      const res = await createCase(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Case created.");
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
            {mode === "edit" ? "Edit case" : "New case"}
          </DialogTitle>
          <DialogDescription>
            Track seller support cases tied to reconciliation types and SKUs.
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
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(CaseStatus).map((s) => (
                            <SelectItem key={s} value={s}>
                              {s.replace(/_/g, " ")}
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
                  name="shipmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shipment ID</FormLabel>
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="orderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order ID</FormLabel>
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="referenceId"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input
                          type="hidden"
                          {...field}
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="caseReason"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Case reason</FormLabel>
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unitsClaimed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Units claimed</FormLabel>
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
                  name="unitsApproved"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Units approved</FormLabel>
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
                  name="amountClaimed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount claimed</FormLabel>
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="amountApproved"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount approved</FormLabel>
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <Input {...field} value={String(field.value ?? "")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="issueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issue date</FormLabel>
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
                  name="raisedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Raised date</FormLabel>
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
                  name="resolvedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resolved date</FormLabel>
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
                  name="caseUrl"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Amazon Case URL</FormLabel>
                      <FormControl>
                        <Input
                          type="url"
                          {...field}
                          value={String(field.value ?? "")}
                          placeholder="https://sellercentral.amazon.com/cu/case-dashboard/view-case?caseID=..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="attachmentUrl"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Attachment (PDF)</FormLabel>
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file) return;
                            const fd = new FormData();
                            fd.append("file", file);
                            const res = await uploadCaseAttachment(fd);
                            if (!res.ok) {
                              toast.error(res.error);
                              return;
                            }
                            field.onChange(res.url);
                            toast.success("📎 PDF attached");
                          }}
                          className="text-xs"
                        />
                        {field.value ? (
                          <>
                            <a
                              href={String(field.value)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 underline"
                            >
                              View
                            </a>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => field.onChange("")}
                            >
                              Remove
                            </Button>
                          </>
                        ) : null}
                      </div>
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
                    : "Create case"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
