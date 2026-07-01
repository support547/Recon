export const REPORT_TYPE_VALUES = [
  "shipped_to_fba",
  "sales_data",
  "fba_receipts",
  "customer_returns",
  "reimbursements",
  "fba_removals",
  "fc_transfers",
  "shipment_status",
  "fba_summary",
  "replacements",
  "adjustments",
  "inventory_adjustments",
  "gnr_report",
  "payment_repository",
  "removal_shipments",
  "settlement_report",
  "inbound_charges",
] as const;

export type ReportTypeValue = (typeof REPORT_TYPE_VALUES)[number];

/* Settlement Report extras — Amazon distinguishes two account types and
 * the seller operates in multiple marketplaces. Both selectors are required
 * at upload time and are persisted on every inserted row. */
export const SETTLEMENT_ACCOUNT_TYPES = [
  "STANDARD_ORDERS",
  "INVOICED_ORDERS",
] as const;
export type SettlementAccountType = (typeof SETTLEMENT_ACCOUNT_TYPES)[number];

export const SETTLEMENT_ACCOUNT_TYPE_LABELS: Record<
  SettlementAccountType,
  string
> = {
  STANDARD_ORDERS: "Standard Orders",
  INVOICED_ORDERS: "Invoiced Orders",
};

export const SETTLEMENT_STORES = ["USA", "CA"] as const;
export type SettlementStore = (typeof SETTLEMENT_STORES)[number];

export function isSettlementAccountType(
  v: string,
): v is SettlementAccountType {
  return (SETTLEMENT_ACCOUNT_TYPES as readonly string[]).includes(v);
}
export function isSettlementStore(v: string): v is SettlementStore {
  return (SETTLEMENT_STORES as readonly string[]).includes(v);
}

export type UploadHistoryRow = {
  id: string;
  reportType: string;
  filename: string;
  rowCount: number;
  rowsSkipped: number;
  isLocked: boolean;
  uploadedAt: Date;
};

export type UploadSummaryRow = {
  reportType: string;
  uploadCount: number;
  totalRows: number;
  lastUpload: Date | null;
  lastRowCount: number;
  latestInFile: Date | null;
  oldestInFile: Date | null;
};

export type UploadFileResult =
  | {
      ok: true;
      rowsInserted: number;
      rowsSkipped: number;
      totalInFile: number;
      filename: string;
      reportType: string;
      // Only the "inbound_charges" processor upserts, so this is optional and
      // absent for every other report type.
      rowsUpdated?: number;
    }
  | { ok: false; error: string };

export type UploadMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export function uploadResultDescription(
  rowsInserted: number,
  rowsSkipped: number,
  totalInFile: number,
  filename: string,
  rowsUpdated?: number,
): { variant: "success" | "warning"; description: string } {
  if (rowsUpdated && rowsUpdated > 0) {
    const parts = [
      `${rowsInserted.toLocaleString()} created`,
      `${rowsUpdated.toLocaleString()} updated`,
    ];
    if (rowsSkipped > 0) parts.push(`${rowsSkipped.toLocaleString()} skipped`);
    return {
      variant: "success",
      description: `✅ ${parts.join(" · ")}`,
    };
  }
  if (rowsInserted > 0 && rowsSkipped === 0) {
    return {
      variant: "success",
      description: `✅ Uploaded ${rowsInserted.toLocaleString()} new rows from ${filename}`,
    };
  }
  if (rowsInserted > 0 && rowsSkipped > 0) {
    return {
      variant: "success",
      description: `✅ ${rowsInserted.toLocaleString()} new rows added · ${rowsSkipped.toLocaleString()} duplicates skipped`,
    };
  }
  if (totalInFile > 0) {
    return {
      variant: "warning",
      description: `⚠️ No new rows — all ${totalInFile.toLocaleString()} rows already exist`,
    };
  }
  return {
    variant: "success",
    description: `✅ Uploaded ${rowsInserted.toLocaleString()} new rows from ${filename}`,
  };
}
