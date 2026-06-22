import { z } from "zod";

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

const requiredString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(1, "Required").max(max),
  );

export const InboundShipmentSchema = z.object({
  id: z.string().cuid().optional(),
  shipmentId: requiredString(128),
  manualProcFee: decimalNullable,
  placementFee: decimalNullable,
  partneredCarrier: decimalNullable,
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  deletedAt: z.union([z.coerce.date(), z.null()]).optional(),
});

export type InboundShipmentValues = z.infer<typeof InboundShipmentSchema>;

export const InboundShipmentCreateSchema = InboundShipmentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type InboundShipmentCreateValues = z.infer<
  typeof InboundShipmentCreateSchema
>;

export const InboundShipmentUpdateSchema = InboundShipmentCreateSchema.extend({
  id: z.string().cuid(),
});

export type InboundShipmentUpdateValues = z.infer<
  typeof InboundShipmentUpdateSchema
>;

export const InboundShipmentUpsertSchema = z.object({
  id: z.string().cuid().optional(),
  shipmentId: requiredString(128),
  manualProcFee: decimalNullable,
  placementFee: decimalNullable,
  partneredCarrier: decimalNullable,
});

export type InboundShipmentUpsertValues = z.infer<
  typeof InboundShipmentUpsertSchema
>;
