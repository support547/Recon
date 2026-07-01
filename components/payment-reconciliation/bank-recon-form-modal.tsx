"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { upsertBankTransaction } from "@/actions/bank-reconciliation";
import type { BankTransactionRow } from "@/lib/bank/types";
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
import { Textarea } from "@/components/ui/textarea";
import { BankTransactionUpsertSchema } from "@/lib/validations/bank-reconciliation";

type FormValues = {
  txnDate: string;
  description: string;
  amountUsd: string;
  bankReference: string;
  notes: string;
};

function emptyForm(): FormValues {
  return {
    txnDate: new Date().toISOString().slice(0, 10),
    description: "",
    amountUsd: "",
    bankReference: "",
    notes: "",
  };
}

function rowToForm(row: BankTransactionRow): FormValues {
  return {
    txnDate: new Date(row.txnDate).toISOString().slice(0, 10),
    description: row.description ?? "",
    amountUsd: row.amountUsd,
    bankReference: row.bankReference ?? "",
    notes: row.notes ?? "",
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  item: BankTransactionRow | null;
  onSaved: () => void;
};

export function BankReconFormModal({
  open,
  onOpenChange,
  mode,
  item,
  onSaved,
}: Props) {
  const form = useForm({
    resolver: zodResolver(BankTransactionUpsertSchema),
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
    const res = await upsertBankTransaction(payload);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      mode === "edit" ? "Transaction updated." : "Transaction created.",
    );
    onOpenChange(false);
    onSaved();
  }

  const title =
    mode === "edit" ? "Edit bank transaction" : "New bank transaction";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Store/currency and matchability are auto-detected from the
            description on save.
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
                  name="txnDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Date <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="date"
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="amountUsd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Amount USD (signed){" "}
                        <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="decimal"
                          placeholder="+ credit / − debit"
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Bank memo text as shown on statement"
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankReference"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Bank reference</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Optional trace/reference number"
                          value={String(field.value ?? "")}
                        />
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
                          placeholder="Optional internal notes"
                          value={String(field.value ?? "")}
                          rows={3}
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
                    : "Add transaction"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
