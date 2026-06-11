import { z } from "zod";

const numLike = z.union([z.string(), z.number()]).transform((v) => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
});

const intLike = z.union([z.string(), z.number()]).transform((v) => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number.parseInt(String(v).replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
});

const optStr = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (!v) return null;
    const s = String(v).trim();
    return s.length ? s : null;
  });

export const adjRaiseCaseSchema = z.object({
  msku: optStr,
  fnsku: optStr,
  asin: optStr,
  title: optStr,
  claimType: z.string().min(1),
  unitsClaimed: intLike,
  amountClaimed: numLike,
  caseId: optStr,
  caseUrl: optStr,
  status: z.string().min(1),
  notes: optStr,
}).refine((v) => (v.msku && v.msku.length > 0) || (v.asin && v.asin.length > 0), {
  message: "Either MSKU or ASIN required",
});

export type AdjRaiseCaseInputZ = z.infer<typeof adjRaiseCaseSchema>;

export const adjManualAdjSchema = z.object({
  msku: optStr,
  fnsku: optStr,
  asin: optStr,
  title: optStr,
  qtyAdjusted: intLike,
  amount: numLike.optional(),
  referenceId: optStr,
  adjType: z.string().min(1),
  reason: z.string().min(1),
  adjDate: optStr,
  notes: optStr,
}).refine((v) => (v.msku && v.msku.length > 0) || (v.asin && v.asin.length > 0), {
  message: "Either MSKU or ASIN required",
});

export type AdjManualAdjInputZ = z.infer<typeof adjManualAdjSchema>;
