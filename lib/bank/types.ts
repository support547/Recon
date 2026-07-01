export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type BankMatchStatusFilter = "UNMATCHED" | "MATCHED" | "DISCREPANCY";
export type BankDirectionFilter = "CREDIT" | "DEBIT";
export type BankSourceCategoryFilter =
  | "USA_PAYOUT"
  | "CA_PAYOUT"
  | "MX_PAYOUT"
  | "OTHER";

export type BankTransactionFilters = {
  matchStatus?: BankMatchStatusFilter | null;
  direction?: BankDirectionFilter | null;
  sourceCategory?: BankSourceCategoryFilter | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
};

export type BankTransactionRow = {
  id: string;
  txnDate: Date;
  description: string | null;
  amountUsd: string;
  direction: "CREDIT" | "DEBIT";
  sourceCategory: BankSourceCategoryFilter;
  detectedStore: string | null;
  detectedCurrency: string | null;
  matchable: boolean;
  matchedSettlementId: string | null;
  matchStatus: BankMatchStatusFilter;
  settlementExpected: string | null;
  varianceUsd: string | null;
  impliedFxRate: string | null;
  bankReference: string | null;
  notes: string | null;
  importBatchId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SettlementCandidate = {
  settlementId: string;
  store: "USA" | "CA" | null;
  currency: string | null;
  totalAmount: string;
  depositDate: string | null;
  startDate: string | null;
  endDate: string | null;
  amountUsdEquivalent: number;
  varianceUsd: number | null;
  withinTolerance: boolean;
  suggested: boolean;
};

export type MatchedSettlementDetail = {
  settlementId: string;
  store: string | null;
  currency: string | null;
  totalAmount: string;
  depositDate: string | null;
  startDate: string | null;
  endDate: string | null;
  varianceUsd: string | null;
  impliedFxRate: string | null;
  amountUsdBankReceived: string;
  matchStatus: BankMatchStatusFilter;
  lineCount: number;
  lineBreakdown: Array<{
    transactionType: string | null;
    amountType: string | null;
    amountDescription: string | null;
    sum: string;
    rows: number;
  }>;
};

export type BankReconciliationKpis = {
  unmatchedPayouts: { count: number; sumUsd: string };
  matched: { count: number; sumUsd: string };
  discrepancies: { count: number; sumAbsVarianceUsd: string };
  caSummary: { count: number; sumUsdReceived: string; blendedFxNote: string };
  nonMatchableCredits: { count: number; sumUsd: string };
};

export type ParsedBankRow = {
  txnDate: Date;
  description: string | null;
  amountUsd: number;
};

export type BankImportResult = {
  ok: true;
  rowsInserted: number;
  rowsSkipped: number;
  totalInFile: number;
  importBatchId: string;
  counts: {
    usaPayout: number;
    caPayout: number;
    mxPayout: number;
    other: number;
    credits: number;
    debits: number;
  };
  warnings?: string[];
};
