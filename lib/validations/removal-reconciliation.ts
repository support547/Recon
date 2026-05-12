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

const optDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (!v) return null;
    const s = String(v).trim();
    return s.length ? s : null;
  });

export const receiveActionSchema = z
  .object({
    orderId: z.string().min(1),
    fnsku: z.string().min(1),
    msku: optStr,
    trackingNumber: optStr,
    carrier: optStr,
    expectedQty: intLike,
    receivedDate: optDate,
    receivedQty: intLike,
    sellableQty: intLike,
    unsellableQty: intLike,
    conditionReceived: z.string().min(1),
    notes: optStr,
    receivedBy: optStr,
    warehouseComment: optStr,
    transferTo: optStr,
    whStatus: optStr,
    wrongItemReceived: z.boolean().default(false),
    wrongItemNotes: optStr,
    raiseCase: z.boolean().default(false),
    caseReason: optStr,
    unitsClaimed: intLike,
    amountClaimed: numLike,
    caseNotes: optStr,
    issueDate: optDate,
    // Extended fields (Task L)
    invoiceNumber: optStr,
    reshippedQty: intLike,
    itemTitle: optStr,
    binLocation: optStr,
  })
  .refine((v) => v.sellableQty + v.unsellableQty <= v.receivedQty + 0.001, {
    message: "Sellable + Unsellable cannot exceed Received qty",
    path: ["sellableQty"],
  });

export type ReceiveActionInputZ = z.infer<typeof receiveActionSchema>;

export const reimbursementSchema = z.object({
  receiptId: optStr,
  orderId: z.string().min(1),
  fnsku: z.string().min(1),
  reimbQty: intLike,
  reimbAmount: numLike,
  notes: optStr,
});

export type ReimbursementInputZ = z.infer<typeof reimbursementSchema>;

export const postActionSchema = z.object({
  receiptId: z.string().min(1),
  postAction: z.string().min(1),
  actionRemarks: optStr,
  actionDate: optDate,
  transferTo: optStr,
  reimbQty: intLike,
  reimbAmount: numLike,
  sellerStatus: optStr,
  sellerComments: optStr,
  warehouseBilled: z.boolean().default(false),
  billedDate: optDate,
  billedAmount: numLike,
  // Extended fields (Task L)
  invoiceNumber: optStr,
  reshippedQty: intLike,
});

export type PostActionInputZ = z.infer<typeof postActionSchema>;
