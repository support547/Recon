/** Upload / explorer tab ids — aligned with `lib/upload-report-types` */
export const DATA_EXPLORER_TAB_IDS = [
  "shipped_to_fba",
  "shipped_cost",
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
] as const;

export type DataExplorerTabId = (typeof DATA_EXPLORER_TAB_IDS)[number];

export const DATA_EXPLORER_TABS: {
  id: DataExplorerTabId;
  label: string;
}[] = [
  { id: "shipped_to_fba", label: "Shipped to FBA" },
  { id: "shipped_cost", label: "💰 Cost Data" },
  { id: "sales_data", label: "Sales Data" },
  { id: "fba_receipts", label: "FBA Receipts" },
  { id: "customer_returns", label: "Customer Returns" },
  { id: "reimbursements", label: "Reimbursements" },
  { id: "fba_removals", label: "FBA Removals" },
  { id: "fc_transfers", label: "FC Transfers" },
  { id: "shipment_status", label: "Shipment Status" },
  { id: "fba_summary", label: "FBA Summary" },
  { id: "replacements", label: "Replacements" },
  { id: "adjustments", label: "Adjustments" },
  { id: "gnr_report", label: "GNR Report" },
  { id: "payment_repository", label: "Payment Repository" },
];

export function isDataExplorerTabId(v: string): v is DataExplorerTabId {
  return (DATA_EXPLORER_TAB_IDS as readonly string[]).includes(v);
}
