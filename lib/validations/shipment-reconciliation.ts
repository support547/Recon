import { z } from "zod";

/** Raise-case flow from reconciliation drawer / action modal */
export const shipmentReconCaseActionSchema = z.object({
  msku: z.string().min(1),
  asin: z.string().optional(),
  fnsku: z.string().optional(),
  title: z.string().optional(),
  shipment_id: z.string().min(1),
  case_reason: z.string().min(1),
  units_claimed: z.coerce.number().int().min(0),
  amount_claimed: z.union([z.string(), z.number(), z.null()]).optional(),
  case_id: z.string().nullable().optional(),
  status: z.enum([
    "pending",
    "raised",
    "approved",
    "partial",
    "rejected",
    "closed",
  ]),
  issue_date: z.string().optional(),
  notes: z.string().optional(),
});

export type ShipmentReconCaseActionInput = z.infer<
  typeof shipmentReconCaseActionSchema
>;

/** Manual adjustment from reconciliation action modal */
export const shipmentReconAdjActionSchema = z.object({
  msku: z.string().min(1),
  asin: z.string().optional(),
  fnsku: z.string().optional(),
  title: z.string().optional(),
  shipment_id: z.string().min(1),
  adj_type: z.enum([
    "found",
    "lost",
    "damaged",
    "correction",
    "count_adjustment",
    "donated",
    "other",
  ]),
  qty_before: z.coerce.number().int(),
  qty_adjusted: z.coerce.number().int(),
  reason: z.string().min(1),
  verified_by: z.string().optional(),
  notes: z.string().optional(),
  adj_date: z.string().optional(),
});

export type ShipmentReconAdjActionInput = z.infer<
  typeof shipmentReconAdjActionSchema
>;

const reconLegacyEnum = z.enum([
  "shipment",
  "removal",
  "return",
  "fc_transfer",
  "fba_balance",
  "other",
]);

const legacyCaseStatusEnum = z.enum([
  "pending",
  "raised",
  "approved",
  "partial",
  "rejected",
  "closed",
]);

export const shipmentCaStandaloneCaseSchema = z.object({
  id: z.string().cuid().optional(),
  msku: z.string().min(1),
  asin: z.string().optional(),
  fnsku: z.string().optional(),
  title: z.string().optional(),
  recon_type: reconLegacyEnum,
  shipment_id: z.string().optional(),
  order_id: z.string().optional(),
  case_reason: z.string().optional(),
  units_claimed: z.coerce.number().int().min(0).optional(),
  units_approved: z.coerce.number().int().min(0).optional(),
  amount_claimed: z.union([z.string(), z.number(), z.null()]).optional(),
  amount_approved: z.union([z.string(), z.number(), z.null()]).optional(),
  case_id: z.string().nullable().optional(),
  status: legacyCaseStatusEnum,
  issue_date: z.string().optional(),
  raised_date: z.string().optional(),
  resolved_date: z.string().optional(),
  notes: z.string().optional(),
});

export type ShipmentCaStandaloneCaseInput = z.infer<
  typeof shipmentCaStandaloneCaseSchema
>;

const adjLegacyEnum = z.enum([
  "found",
  "lost",
  "damaged",
  "correction",
  "count_adjustment",
  "donated",
  "other",
]);

export const shipmentCaStandaloneAdjustmentSchema = z.object({
  id: z.string().cuid().optional(),
  msku: z.string().min(1),
  asin: z.string().optional(),
  fnsku: z.string().optional(),
  title: z.string().optional(),
  recon_type: reconLegacyEnum,
  adj_type: adjLegacyEnum,
  shipment_id: z.string().optional(),
  qty_before: z.coerce.number().int(),
  qty_adjusted: z.coerce.number().int(),
  reason: z.string().min(1),
  verified_by: z.string().optional(),
  source_doc: z.string().optional(),
  notes: z.string().optional(),
  adj_date: z.string().optional(),
});

export type ShipmentCaStandaloneAdjustmentInput = z.infer<
  typeof shipmentCaStandaloneAdjustmentSchema
>;
