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
  "gnr_report",
  "payment_repository",
  "removal_shipments",
  "settlement_report",
] as const;

export type ReportTypeValue = (typeof REPORT_TYPE_VALUES)[number];

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
};

export type UploadFileResult =
  | {
      ok: true;
      rowsInserted: number;
      rowsSkipped: number;
      totalInFile: number;
      filename: string;
      reportType: string;
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
): { variant: "success" | "warning"; description: string } {
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
