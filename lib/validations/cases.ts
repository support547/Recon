import { AdjType, CaseStatus, ReconType } from "@prisma/client";
import { z } from "zod";

/** Empty / blank inputs → null for optional DB strings */
function optionalString(max: number) {
  return z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().trim().max(max).nullable(),
  );
}

function optionalIdString(max: number) {
  return z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().trim().max(max).nullable(),
  );
}

const decimalNullable = z.preprocess(
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
        typeof v === "number" ? v : Number.parseFloat(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    }),
);

const dateTimeNullableOptional = z.preprocess(
  (v) => {
    if (v === "" || v === undefined) return undefined;
    if (v === null) return null;
    return v;
  },
  z.union([z.coerce.date(), z.null()]).optional(),
);

/**
 * All scalar fields aligned with Prisma `CaseTracker` (excluding relations).
 */
export const CaseTrackerSchema = z.object({
  id: z.string().cuid().optional(),
  msku: optionalString(512),
  asin: optionalString(64),
  fnsku: optionalString(128),
  title: optionalString(4000),
  reconType: z.nativeEnum(ReconType),
  shipmentId: optionalIdString(256),
  orderId: optionalIdString(256),
  referenceId: optionalIdString(256),
  caseReason: optionalString(4000),
  unitsClaimed: z.coerce.number().int().min(0).default(0),
  unitsApproved: z.coerce.number().int().min(0).default(0),
  amountClaimed: decimalNullable,
  amountApproved: decimalNullable,
  currency: optionalString(16),
  status: z.nativeEnum(CaseStatus).default(CaseStatus.OPEN),
  issueDate: dateTimeNullableOptional,
  raisedDate: dateTimeNullableOptional,
  resolvedDate: dateTimeNullableOptional,
  notes: optionalString(16000),
  store: optionalString(128),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  deletedAt: z.union([z.coerce.date(), z.null()]).optional(),
});

export type CaseTrackerValues = z.infer<typeof CaseTrackerSchema>;

export const CaseTrackerCreateSchema = CaseTrackerSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type CaseTrackerCreateValues = z.infer<typeof CaseTrackerCreateSchema>;

export const CaseTrackerUpdateSchema = CaseTrackerSchema.partial().extend({
  id: z.string().cuid(),
});

export type CaseTrackerUpdateValues = z.infer<typeof CaseTrackerUpdateSchema>;

/**
 * All scalar fields aligned with Prisma `ManualAdjustment` (excluding relations).
 */
export const ManualAdjustmentSchema = z.object({
  id: z.string().cuid().optional(),
  msku: optionalString(512),
  asin: optionalString(64),
  fnsku: optionalString(128),
  title: optionalString(4000),
  reconType: z.nativeEnum(ReconType),
  shipmentId: optionalIdString(256),
  orderId: optionalIdString(256),
  referenceId: optionalIdString(256),
  adjType: z.nativeEnum(AdjType).default(AdjType.QUANTITY),
  qtyBefore: z.coerce.number().int().default(0),
  qtyAdjusted: z.coerce.number().int().default(0),
  qtyAfter: z.coerce.number().int().default(0),
  reason: optionalString(4000),
  verifiedBy: optionalString(256),
  sourceDoc: optionalString(512),
  notes: optionalString(16000),
  adjDate: dateTimeNullableOptional,
  store: optionalString(128),
  caseId: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().cuid().nullable().optional(),
  ),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  deletedAt: z.union([z.coerce.date(), z.null()]).optional(),
});

export type ManualAdjustmentValues = z.infer<typeof ManualAdjustmentSchema>;

export const ManualAdjustmentCreateSchema = ManualAdjustmentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  qtyAfter: true,
});

export type ManualAdjustmentCreateValues = z.infer<
  typeof ManualAdjustmentCreateSchema
>;

export const ManualAdjustmentUpdateSchema = ManualAdjustmentSchema.partial().extend(
  {
    id: z.string().cuid(),
  },
);

export type ManualAdjustmentUpdateValues = z.infer<
  typeof ManualAdjustmentUpdateSchema
>;

export const CaseTrackerFullUpdateSchema = CaseTrackerCreateSchema.extend({
  id: z.string().cuid(),
});

export const ManualAdjustmentFullUpdateSchema =
  ManualAdjustmentCreateSchema.extend({
    id: z.string().cuid(),
  });
