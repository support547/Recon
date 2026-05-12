"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { GradeResellStatus } from "@prisma/client";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  createGradeResellItem,
  markAsSold,
  updateGradeResellItem,
  type GradeResellItemRow,
} from "@/actions/grade-resell";
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
import {
  GradeResellCreateSchema,
  GradeResellMarkAsSoldSchema,
} from "@/lib/validations/grade-resell";

type FormValues = Record<string, string | number | GradeResellStatus | null | undefined>;

function emptyForm(): FormValues {
  return {
    msku: "",
    fnsku: "",
    asin: "",
    title: "",
    quantity: 1,
    grade: "",
    resellPrice: "",
    channel: "",
    status: GradeResellStatus.PENDING,
    notes: "",
    gradedBy: "",
    gradedDate: "",
    orderId: "",
    lpn: "",
    usedMsku: "",
    usedFnsku: "",
    usedCondition: "",
    unitStatus: "",
    store: "",
  };
}

function rowToForm(row: GradeResellItemRow): FormValues {
  return {
    msku: row.msku ?? "",
    fnsku: row.fnsku ?? "",
    asin: row.asin ?? "",
    title: row.title ?? "",
    quantity: row.quantity,
    grade: row.grade ?? "",
    resellPrice: row.resellPrice ?? "",
    channel: row.channel ?? "",
    status: row.status,
    notes: row.notes ?? "",
    gradedBy: row.gradedBy ?? "",
    gradedDate: toDatetimeLocalValue(row.gradedDate),
    orderId: row.orderId ?? "",
    lpn: row.lpn ?? "",
    usedMsku: row.usedMsku ?? "",
    usedFnsku: row.usedFnsku ?? "",
    usedCondition: row.usedCondition ?? "",
    unitStatus: row.unitStatus ?? "",
    store: row.store ?? "",
  };
}

type GradeResellFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit" | "mark-sold";
  item: GradeResellItemRow | null;
  onSaved: () => void;
};

export function GradeResellFormModal({
  open,
  onOpenChange,
  mode,
  item,
  onSaved,
}: GradeResellFormModalProps) {
  const isSoldFlow = mode === "mark-sold";

  const form = useForm({
    resolver: zodResolver(
      isSoldFlow ? GradeResellMarkAsSoldSchema : GradeResellCreateSchema,
    ),
    defaultValues: (isSoldFlow
      ? { id: item?.id ?? "", soldPrice: "", soldDate: "" }
      : (emptyForm() as never)) as never,
  });

  React.useEffect(() => {
    if (!open) return;
    if (isSoldFlow && item) {
      form.reset({
        id: item.id,
        soldPrice: item.soldPrice ?? item.resellPrice ?? "",
        soldDate: toDatetimeLocalValue(item.soldDate) || "",
      } as never);
    } else if (mode === "edit" && item) {
      form.reset(rowToForm(item) as never);
    } else {
      form.reset(emptyForm() as never);
    }
  }, [open, mode, item, form, isSoldFlow]);

  async function onSubmit(values: unknown) {
    if (isSoldFlow && item) {
      const res = await markAsSold({ ...(values as object), id: item.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Marked as sold.");
    } else if (mode === "edit" && item) {
      const res = await updateGradeResellItem(item.id, values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Item updated.");
    } else {
      const res = await createGradeResellItem(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Item created.");
    }
    onOpenChange(false);
    onSaved();
  }

  const title = isSoldFlow
    ? "Mark as sold"
    : mode === "edit"
      ? "Edit grade & resell item"
      : "New grade & resell item";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,920px)] flex-col gap-0 overflow-hidden sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isSoldFlow
              ? "Record the sold date and price; status will move to SOLD."
              : "Track manual grading and resale of returned or warehouse inventory."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
              {isSoldFlow ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="soldPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sold price</FormLabel>
                        <FormControl>
                          <Input
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
                    name="soldDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sold date</FormLabel>
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
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="msku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          MSKU <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
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
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Quantity <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
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
                    name="fnsku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>FNSKU</FormLabel>
                        <FormControl>
                          <Input
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
                    name="asin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ASIN</FormLabel>
                        <FormControl>
                          <Input
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
                    name="title"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input
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
                    name="grade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grade</FormLabel>
                        <Select
                          value={String(field.value ?? "")}
                          onValueChange={(v) =>
                            field.onChange(v === "__none__" ? "" : v)
                          }
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select grade" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            <SelectItem value="Good">Good</SelectItem>
                            <SelectItem value="Fair">Fair</SelectItem>
                            <SelectItem value="Poor">Poor</SelectItem>
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
                          value={String(field.value ?? "")}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.values(GradeResellStatus).map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
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
                    name="resellPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resell price</FormLabel>
                        <FormControl>
                          <Input
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
                    name="channel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Channel</FormLabel>
                        <Select
                          value={String(field.value ?? "")}
                          onValueChange={(v) =>
                            field.onChange(v === "__none__" ? "" : v)
                          }
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select channel" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            <SelectItem value="FBA">FBA</SelectItem>
                            <SelectItem value="Ebay">Ebay</SelectItem>
                            <SelectItem value="Amazon">Amazon</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="gradedBy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Graded by</FormLabel>
                        <FormControl>
                          <Input
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
                    name="gradedDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Graded date</FormLabel>
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
                    name="orderId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order ID</FormLabel>
                        <FormControl>
                          <Input
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
                    name="lpn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>LPN</FormLabel>
                        <FormControl>
                          <Input
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
                    name="usedMsku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Used MSKU</FormLabel>
                        <FormControl>
                          <Input
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
                    name="usedFnsku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Used FNSKU</FormLabel>
                        <FormControl>
                          <Input
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
                    name="usedCondition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Used condition</FormLabel>
                        <FormControl>
                          <Input
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
                    name="unitStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit status</FormLabel>
                        <FormControl>
                          <Input
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
                          <Input
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
                    name="notes"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={3}
                            value={String(field.value ?? "")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
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
                  : isSoldFlow
                    ? "Mark sold"
                    : mode === "edit"
                      ? "Save changes"
                      : "Create item"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
