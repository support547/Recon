import type { AdjType, ReconType } from "@prisma/client";
import { Prisma } from "@prisma/client";

export type ManualAdjustmentRow = {
  id: string;
  msku: string | null;
  asin: string | null;
  fnsku: string | null;
  title: string | null;
  reconType: ReconType;
  shipmentId: string | null;
  orderId: string | null;
  referenceId: string | null;
  adjType: AdjType;
  qtyBefore: number;
  qtyAdjusted: number;
  qtyAfter: number;
  amount: string | null;
  reason: string | null;
  verifiedBy: string | null;
  sourceDoc: string | null;
  notes: string | null;
  adjDate: Date | null;
  store: string | null;
  receivedAsFnsku: string | null;
  originalMsku: string | null;
  caseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export function serializeManualAdjustmentRow(row: {
  id: string;
  msku: string | null;
  asin: string | null;
  fnsku: string | null;
  title: string | null;
  reconType: ReconType;
  shipmentId: string | null;
  orderId: string | null;
  referenceId: string | null;
  adjType: AdjType;
  qtyBefore: number;
  qtyAdjusted: number;
  qtyAfter: number;
  amount: Prisma.Decimal | null;
  reason: string | null;
  verifiedBy: string | null;
  sourceDoc: string | null;
  notes: string | null;
  adjDate: Date | null;
  store: string | null;
  receivedAsFnsku: string | null;
  originalMsku: string | null;
  caseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): ManualAdjustmentRow {
  return {
    ...row,
    amount: row.amount?.toString() ?? null,
  };
}
