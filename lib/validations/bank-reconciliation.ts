import { z } from "zod";

const decimalCoerced = z.preprocess(
  (val) => {
    if (val === "" || val === undefined || val === null) return null;
    return val;
  },
  z
    .union([z.number(), z.string()])
    .nullable()
    .transform((v): number | null => {
      if (v === null || v === undefined) return null;
      const n =
        typeof v === "number"
          ? v
          : Number.parseFloat(String(v).replace(/[$,]/g, "").trim());
      return Number.isFinite(n) ? n : null;
    }),
);

const decimalRequired = z.preprocess(
  (val) => {
    if (val === "" || val === undefined || val === null) return undefined;
    return val;
  },
  z
    .union([z.number(), z.string()])
    .transform((v): number => {
      const n =
        typeof v === "number"
          ? v
          : Number.parseFloat(String(v).replace(/[$,]/g, "").trim());
      return Number.isFinite(n) ? n : NaN;
    })
    .refine((n) => Number.isFinite(n), "Amount is required."),
);

const isoDate = z.preprocess(
  (v) => {
    if (v == null || v === "") return undefined;
    if (v instanceof Date) return v;
    return String(v);
  },
  z.coerce.date({ error: "Invalid date." }),
);

export const BankTransactionUpsertSchema = z.object({
  id: z.string().cuid().optional(),
  txnDate: isoDate,
  description: z
    .preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z.string().max(1024).nullable().optional(),
    )
    .transform((v) => (v == null || v === "" ? null : v)),
  amountUsd: decimalRequired,
  bankReference: z
    .preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z.string().max(256).nullable().optional(),
    )
    .transform((v) => (v == null || v === "" ? null : v)),
  notes: z
    .preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z.string().max(2048).nullable().optional(),
    )
    .transform((v) => (v == null || v === "" ? null : v)),
});

export type BankTransactionUpsertValues = z.infer<
  typeof BankTransactionUpsertSchema
>;

export const BankMatchInputSchema = z.object({
  bankTxnId: z.string().cuid(),
  settlementId: z.string().min(1),
  toleranceUsd: decimalCoerced.optional(),
});

export type BankMatchInputValues = z.infer<typeof BankMatchInputSchema>;
