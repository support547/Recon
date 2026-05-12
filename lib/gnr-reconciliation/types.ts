export type GnrActionStatus =
  | "matched"
  | "take-action"
  | "waiting"
  | "over-accounted"
  | "balanced"
  | "review";

export type GnrReconRow = {
  usedMsku: string;
  usedFnsku: string;
  origFnsku: string;
  asin: string;
  usedCondition: string;
  gnrQty: number;
  succeededQty: number;
  failedQty: number;
  orderCount: number;
  orderIds: string;
  lpns: string;
  firstDate: string;
  lastDate: string;
  salesQty: number;
  returnQty: number;
  removalQty: number;
  reimbQty: number;
  reimbAmount: number;
  endingBalance: number;
  fbaEnding: number | null;
  fbaSummaryDate: string;
  caseCount: number;
  caseClaimedQty: number;
  caseApprovedQty: number;
  caseApprovedAmount: number;
  caseTopStatus: string;
  caseIds: string;
  caseReasons: string;
  caseNotes: string;
  caseFirstRaisedAt: string;
  caseLastUpdatedAt: string;
  adjQty: number;
  adjCount: number;
  adjReasons: string;
  actionStatus: GnrActionStatus;
  daysSince: number;
};

export type GnrLogRow = {
  id: string;
  entrySource: "report" | "manual";
  reportDate: string;
  orderId: string;
  lpn: string;
  valueRecoveryType: string;
  msku: string;
  fnsku: string;
  asin: string;
  quantity: number;
  unitStatus: string;
  reasonForUnitStatus: string;
  usedCondition: string;
  usedMsku: string;
  usedFnsku: string;
};

export type GnrReconStats = {
  totalSkus: number;
  totalGnrQty: number;
  matched: number;
  takeAction: number;
  waiting: number;
  overAccounted: number;
  balanced: number;
  review: number;
};

export type GnrCombinedRow = {
  usedMsku: string | null;
  usedFnsku: string | null;
  fnsku: string | null;
  asin: string | null;
  usedCondition: string | null;
  quantity: number;
  unitStatus: string | null;
  orderId: string | null;
  lpn: string | null;
  reportDate: Date | null;
};

export type GnrCaseMeta = {
  count: number;
  totalClaimed: number;
  totalApproved: number;
  totalAmount: number;
  topStatus: string;
  caseIds: string[];
  reasons: string[];
  notes: string[];
  firstRaisedAt: Date | null;
  lastUpdatedAt: Date | null;
};

export type GnrAdjMeta = {
  qty: number;
  count: number;
  reasons: string[];
};
