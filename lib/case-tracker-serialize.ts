import type { CaseStatus, ReconType } from "@prisma/client";
import { Prisma } from "@prisma/client";

export function serializeCaseTrackerRow(row: {
  id: string;
  msku: string | null;
  asin: string | null;
  fnsku: string | null;
  title: string | null;
  reconType: ReconType;
  shipmentId: string | null;
  orderId: string | null;
  referenceId: string | null;
  caseReason: string | null;
  unitsClaimed: number;
  unitsApproved: number;
  amountClaimed: Prisma.Decimal | null;
  amountApproved: Prisma.Decimal | null;
  currency: string | null;
  status: CaseStatus;
  issueDate: Date | null;
  raisedDate: Date | null;
  resolvedDate: Date | null;
  notes: string | null;
  store: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    ...row,
    amountClaimed: row.amountClaimed?.toString() ?? null,
    amountApproved: row.amountApproved?.toString() ?? null,
  };
}
