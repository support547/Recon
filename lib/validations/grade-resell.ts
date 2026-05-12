import { GradeResellStatus } from "@prisma/client";
import { z } from "zod";

function optionalString(max: number) {
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
        typeof v === "number"
          ? v
          : Number.parseFloat(String(v).replace(/,/g, ""));
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

const requiredString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(1, "Required").max(max),
  );

export const GradeResellSchema = z.object({
  id: z.string().cuid().optional(),
  source: optionalString(64),
  sourceRef: optionalString(128),
  msku: requiredString(512),
  fnsku: optionalString(128),
  asin: optionalString(64),
  title: optionalString(4000),
  quantity: z.coerce.number().int().positive("Quantity must be positive"),
  grade: optionalString(64),
  resellPrice: decimalNullable,
  channel: optionalString(64),
  status: z.nativeEnum(GradeResellStatus).default(GradeResellStatus.PENDING),
  notes: optionalString(16000),
  gradedBy: optionalString(256),
  gradedDate: dateTimeNullableOptional,
  soldDate: dateTimeNullableOptional,
  soldPrice: decimalNullable,
  orderId: optionalString(256),
  lpn: optionalString(256),
  usedMsku: optionalString(512),
  usedFnsku: optionalString(128),
  usedCondition: optionalString(64),
  unitStatus: optionalString(64),
  store: optionalString(128),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  deletedAt: z.union([z.coerce.date(), z.null()]).optional(),
});

export type GradeResellValues = z.infer<typeof GradeResellSchema>;

export const GradeResellCreateSchema = GradeResellSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type GradeResellCreateValues = z.infer<typeof GradeResellCreateSchema>;

export const GradeResellUpdateSchema = GradeResellCreateSchema.extend({
  id: z.string().cuid(),
});

export type GradeResellUpdateValues = z.infer<typeof GradeResellUpdateSchema>;

export const GradeResellMarkAsSoldSchema = z.object({
  id: z.string().cuid(),
  soldPrice: decimalNullable,
  soldDate: dateTimeNullableOptional,
});

export type GradeResellMarkAsSoldValues = z.infer<
  typeof GradeResellMarkAsSoldSchema
>;
