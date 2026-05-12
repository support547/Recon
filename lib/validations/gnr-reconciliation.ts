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

export const raiseGnrCaseSchema = z.object({
  usedMsku: z.string().min(1),
  usedFnsku: optStr,
  asin: optStr,
  caseId: optStr,
  caseReason: z.string().min(1),
  unitsClaimed: intLike,
  unitsApproved: intLike,
  amountApproved: numLike,
  status: z.string().min(1),
  notes: optStr,
});

export type RaiseGnrCaseInputZ = z.infer<typeof raiseGnrCaseSchema>;

export const gnrAdjustmentSchema = z.object({
  usedMsku: z.string().min(1),
  asin: optStr,
  qtyAdjusted: intLike,
  reason: z.string().min(1),
  adjDate: optStr,
  notes: optStr,
});

export type GnrAdjustmentInputZ = z.infer<typeof gnrAdjustmentSchema>;
