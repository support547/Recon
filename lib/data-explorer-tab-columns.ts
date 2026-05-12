import type { DataExplorerTabId } from "@/lib/data-explorer-constants";
import type { RowData } from "@tanstack/react-table";

export type ExplorerColumnKind = "text" | "date" | "integer" | "money";

export type ExplorerCellRole =
  | "text"
  | "mono"
  | "mono10"
  | "mono10bold"
  | "truncate140"
  | "truncate160"
  | "truncate180"
  | "qtyGreen"
  | "moneyRight"
  | "moneyRightBold"
  | "moneyRightMuted"
  | "integerRight"
  | "chipDisposition"
  | "chipStatus"
  | "chipTeal"
  | "chipBlue"
  | "chipGrey"
  | "chipUnitStatus"
  | "fbaReceiptsGreen"
  | "fbaCustShippedRed"
  | "fbaCustReturnsYellow"
  | "fbaVendorPurple"
  | "fbaFoundGreen"
  | "fbaLostRed"
  | "fbaDamagedOrange"
  | "fbaTransferMono"
  | "fbaDisposedOrange"
  | "fbaOtherOrange"
  | "fbaEndBlueBold"
  | "fbaUnknownOrange"
  | "fbaSummaryOpeningGreen"
  | "fbaSummaryShippedRed"
  | "fbaSummaryCretTeal"
  | "fbaSummaryVretPurple"
  | "fbaSummaryEndBold"
  | "qtyBoldRight";

export type ExplorerColumnSpec = {
  accessorKey: string;
  header: string;
  kind: ExplorerColumnKind;
  currencyKey?: string;
  /** Cell presentation; defaults inferred from kind */
  cell?: ExplorerCellRole;
};

const SHIPPED_TO_FBA: ExplorerColumnSpec[] = [
  {
    accessorKey: "shipmentId",
    header: "Shipment ID",
    kind: "text",
    cell: "chipBlue",
  },
  { accessorKey: "shipDate", header: "Ship Date", kind: "date", cell: "mono" },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "title", header: "Title", kind: "text" },
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  { accessorKey: "fnsku", header: "FNSKU", kind: "text", cell: "mono" },
  {
    accessorKey: "quantity",
    header: "Qty Shipped",
    kind: "integer",
    cell: "qtyGreen",
  },
  { accessorKey: "publisherName", header: "Publisher", kind: "text" },
  { accessorKey: "supplierName", header: "Supplier", kind: "text" },
  { accessorKey: "deliveryLocation", header: "Del Loc", kind: "text" },
  {
    accessorKey: "purchaseId",
    header: "Purchase ID",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "perBookCostUsd",
    header: "Per Book $",
    kind: "money",
    cell: "moneyRight",
  },
  {
    accessorKey: "finalTotalPurchaseCostUsd",
    header: "Line Total $",
    kind: "money",
    cell: "moneyRightBold",
  },
];

const SHIPPED_COST: ExplorerColumnSpec[] = [
  {
    accessorKey: "shipmentId",
    header: "Shipment ID",
    kind: "text",
    cell: "chipBlue",
  },
  { accessorKey: "shipDate", header: "Ship Date", kind: "date", cell: "mono" },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "title", header: "Title", kind: "text" },
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  { accessorKey: "fnsku", header: "FNSKU", kind: "text", cell: "mono" },
  {
    accessorKey: "quantity",
    header: "Qty Shipped",
    kind: "integer",
    cell: "qtyGreen",
  },
  { accessorKey: "publisherName", header: "Publisher", kind: "text" },
  { accessorKey: "supplierName", header: "Supplier", kind: "text" },
  { accessorKey: "deliveryLocation", header: "Del Loc", kind: "text" },
  {
    accessorKey: "purchaseId",
    header: "Purchase ID",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "finalNetPriceUsd",
    header: "Net $ USD",
    kind: "money",
    cell: "moneyRight",
  },
  {
    accessorKey: "commissionUsd",
    header: "Commission $",
    kind: "money",
    cell: "moneyRight",
  },
  {
    accessorKey: "supplierShippingUsd",
    header: "Supp Ship $",
    kind: "money",
    cell: "moneyRight",
  },
  {
    accessorKey: "warehousePrepUsd",
    header: "Prep $",
    kind: "money",
    cell: "moneyRight",
  },
  {
    accessorKey: "inventoryPlaceInboundUsd",
    header: "Inv Place $",
    kind: "money",
    cell: "moneyRight",
  },
  {
    accessorKey: "expertChargesUsd",
    header: "Export $",
    kind: "money",
    cell: "moneyRight",
  },
  {
    accessorKey: "otherChargesUsd",
    header: "Other $",
    kind: "money",
    cell: "moneyRight",
  },
  {
    accessorKey: "perBookCostUsd",
    header: "Per Book $",
    kind: "money",
    cell: "moneyRightBold",
  },
  {
    accessorKey: "finalTotalPurchaseCostUsd",
    header: "Line Total $",
    kind: "money",
    cell: "moneyRightBold",
  },
  {
    accessorKey: "costUpdatedAt",
    header: "Cost Updated",
    kind: "date",
    cell: "mono",
  },
];

const SALES_BY_FNSKU: ExplorerColumnSpec[] = [
  { accessorKey: "saleDate", header: "Sale Date", kind: "date", cell: "mono" },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "fnsku", header: "FNSKU", kind: "text", cell: "mono" },
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  {
    accessorKey: "orderId",
    header: "Order ID",
    kind: "text",
    cell: "mono10",
  },
  { accessorKey: "fc", header: "FC", kind: "text", cell: "chipTeal" },
  {
    accessorKey: "quantity",
    header: "Qty",
    kind: "integer",
    cell: "qtyGreen",
  },
  {
    accessorKey: "productAmount",
    header: "Product $",
    kind: "money",
    currencyKey: "currency",
    cell: "moneyRight",
  },
  {
    accessorKey: "shippingAmount",
    header: "Ship $",
    kind: "money",
    currencyKey: "currency",
    cell: "moneyRightMuted",
  },
  { accessorKey: "shipCity", header: "City", kind: "text" },
  { accessorKey: "shipState", header: "State", kind: "text" },
  {
    accessorKey: "shipPostalCode",
    header: "Postal",
    kind: "text",
    cell: "mono10",
  },
  { accessorKey: "currency", header: "Currency", kind: "text", cell: "mono10" },
];

const SALES_BY_ASIN: ExplorerColumnSpec[] = [
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  {
    accessorKey: "orders",
    header: "Orders",
    kind: "integer",
    cell: "integerRight",
  },
  {
    accessorKey: "unitsSold",
    header: "Units Sold",
    kind: "integer",
    cell: "qtyGreen",
  },
  {
    accessorKey: "firstSale",
    header: "First Sale",
    kind: "date",
    cell: "mono",
  },
  {
    accessorKey: "lastSale",
    header: "Last Sale",
    kind: "date",
    cell: "mono",
  },
  {
    accessorKey: "topFc",
    header: "Top FC",
    kind: "text",
    cell: "chipTeal",
  },
];

const FBA_RECEIPTS: ExplorerColumnSpec[] = [
  {
    accessorKey: "receiptDate",
    header: "Receipt Date",
    kind: "date",
    cell: "mono",
  },
  {
    accessorKey: "shipmentId",
    header: "Shipment ID",
    kind: "text",
    cell: "chipBlue",
  },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "fnsku", header: "FNSKU", kind: "text", cell: "mono" },
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  {
    accessorKey: "title",
    header: "Title",
    kind: "text",
  },
  {
    accessorKey: "quantity",
    header: "Qty",
    kind: "integer",
    cell: "qtyGreen",
  },
  {
    accessorKey: "disposition",
    header: "Disposition",
    kind: "text",
    cell: "chipDisposition",
  },
  { accessorKey: "eventType", header: "Event Type", kind: "text" },
  {
    accessorKey: "fulfillmentCenter",
    header: "Fulfillment Center",
    kind: "text",
    cell: "chipTeal",
  },
  { accessorKey: "reason", header: "Reason", kind: "text" },
  { accessorKey: "country", header: "Country", kind: "text" },
  {
    accessorKey: "reconciledQty",
    header: "Reconciled Qty",
    kind: "integer",
    cell: "integerRight",
  },
  {
    accessorKey: "unreconciledQty",
    header: "Unreconciled Qty",
    kind: "integer",
    cell: "integerRight",
  },
  { accessorKey: "store", header: "Store", kind: "text", cell: "mono" },
];

const CUSTOMER_RETURNS: ExplorerColumnSpec[] = [
  {
    accessorKey: "returnDate",
    header: "Return Date",
    kind: "date",
    cell: "mono",
  },
  {
    accessorKey: "orderId",
    header: "Order ID",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "fnsku", header: "FNSKU", kind: "text", cell: "mono" },
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  { accessorKey: "title", header: "Title", kind: "text" },
  {
    accessorKey: "quantity",
    header: "Qty",
    kind: "integer",
    cell: "qtyBoldRight",
  },
  {
    accessorKey: "disposition",
    header: "Disposition",
    kind: "text",
    cell: "chipDisposition",
  },
  {
    accessorKey: "detailedDisposition",
    header: "Detailed Disposition",
    kind: "text",
  },
  { accessorKey: "reason", header: "Reason", kind: "text" },
  {
    accessorKey: "status",
    header: "Status",
    kind: "text",
    cell: "chipStatus",
  },
  {
    accessorKey: "fulfillmentCenter",
    header: "FC",
    kind: "text",
  },
  {
    accessorKey: "licensePlateNumber",
    header: "License Plate",
    kind: "text",
    cell: "mono",
  },
  { accessorKey: "store", header: "Store", kind: "text", cell: "mono" },
];

const REIMBURSEMENTS: ExplorerColumnSpec[] = [
  {
    accessorKey: "approvalDate",
    header: "Approval Date",
    kind: "date",
    cell: "mono",
  },
  {
    accessorKey: "reimbursementId",
    header: "Reimbursement ID",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "fnsku", header: "FNSKU", kind: "text", cell: "mono" },
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  { accessorKey: "reason", header: "Reason", kind: "text" },
  {
    accessorKey: "qtyCash",
    header: "Qty Cash",
    kind: "integer",
    cell: "integerRight",
  },
  {
    accessorKey: "qtyInventory",
    header: "Qty Inventory",
    kind: "integer",
    cell: "integerRight",
  },
  {
    accessorKey: "amountPerUnit",
    header: "Amount/Unit",
    kind: "money",
    currencyKey: "currency",
    cell: "moneyRight",
  },
  {
    accessorKey: "amount",
    header: "Amount",
    kind: "money",
    currencyKey: "currency",
    cell: "moneyRightBold",
  },
  { accessorKey: "currency", header: "Currency", kind: "text", cell: "mono10" },
  {
    accessorKey: "amazonOrderId",
    header: "Amazon Order ID",
    kind: "text",
    cell: "mono10",
  },
  { accessorKey: "store", header: "Store", kind: "text", cell: "mono" },
];

const FBA_REMOVALS: ExplorerColumnSpec[] = [
  {
    accessorKey: "requestDate",
    header: "Request Date",
    kind: "date",
    cell: "mono",
  },
  {
    accessorKey: "orderId",
    header: "Order ID",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "fnsku", header: "FNSKU", kind: "text", cell: "mono" },
  {
    accessorKey: "quantity",
    header: "Qty",
    kind: "integer",
    cell: "qtyBoldRight",
  },
  {
    accessorKey: "disposition",
    header: "Disposition",
    kind: "text",
    cell: "chipDisposition",
  },
  {
    accessorKey: "orderStatus",
    header: "Order Status",
    kind: "text",
    cell: "chipStatus",
  },
  { accessorKey: "orderType", header: "Order Type", kind: "text" },
  {
    accessorKey: "cancelledQty",
    header: "Cancelled Qty",
    kind: "integer",
    cell: "integerRight",
  },
  {
    accessorKey: "disposedQty",
    header: "Disposed Qty",
    kind: "integer",
    cell: "integerRight",
  },
  {
    accessorKey: "removalFee",
    header: "Removal Fee",
    kind: "money",
    currencyKey: "currency",
    cell: "moneyRight",
  },
  { accessorKey: "store", header: "Store", kind: "text", cell: "mono" },
];

const FC_TRANSFERS: ExplorerColumnSpec[] = [
  {
    accessorKey: "transferDate",
    header: "Transfer Date",
    kind: "date",
    cell: "mono",
  },
  {
    accessorKey: "referenceId",
    header: "Reference ID",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "fnsku", header: "FNSKU", kind: "text", cell: "mono" },
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  { accessorKey: "title", header: "Title", kind: "text" },
  {
    accessorKey: "quantity",
    header: "Qty",
    kind: "integer",
    cell: "qtyBoldRight",
  },
  { accessorKey: "eventType", header: "Event Type", kind: "text" },
  {
    accessorKey: "fulfillmentCenter",
    header: "Fulfillment Center",
    kind: "text",
    cell: "chipTeal",
  },
  {
    accessorKey: "disposition",
    header: "Disposition",
    kind: "text",
    cell: "chipDisposition",
  },
  { accessorKey: "reason", header: "Reason", kind: "text" },
  { accessorKey: "country", header: "Country", kind: "text" },
  {
    accessorKey: "reconciledQty",
    header: "Reconciled Qty",
    kind: "integer",
    cell: "integerRight",
  },
  {
    accessorKey: "unreconciledQty",
    header: "Unreconciled Qty",
    kind: "integer",
    cell: "integerRight",
  },
  { accessorKey: "store", header: "Store", kind: "text", cell: "mono" },
];

const SHIPMENT_STATUS: ExplorerColumnSpec[] = [
  {
    accessorKey: "shipmentId",
    header: "Shipment ID",
    kind: "text",
    cell: "chipBlue",
  },
  {
    accessorKey: "shipmentName",
    header: "Name",
    kind: "text",
    cell: "truncate180",
  },
  { accessorKey: "createdDate", header: "Created", kind: "date", cell: "mono" },
  {
    accessorKey: "lastUpdated",
    header: "Last Updated",
    kind: "date",
    cell: "mono",
  },
  {
    accessorKey: "shipTo",
    header: "Ship To",
    kind: "text",
    cell: "chipGrey",
  },
  {
    accessorKey: "unitsExpected",
    header: "Expected",
    kind: "integer",
    cell: "integerRight",
  },
  {
    accessorKey: "unitsLocated",
    header: "Located",
    kind: "integer",
    cell: "integerRight",
  },
  {
    accessorKey: "status",
    header: "Status",
    kind: "text",
    cell: "chipStatus",
  },
];

const FBA_SUMMARY_DETAILS: ExplorerColumnSpec[] = [
  {
    accessorKey: "summaryDate",
    header: "Date",
    kind: "date",
    cell: "mono",
  },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "fnsku", header: "FNSKU", kind: "text", cell: "mono" },
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  { accessorKey: "title", header: "Title", kind: "text" },
  {
    accessorKey: "disposition",
    header: "Disposition",
    kind: "text",
    cell: "chipDisposition",
  },
  {
    accessorKey: "startingBalance",
    header: "Start Bal",
    kind: "integer",
    cell: "mono",
  },
  {
    accessorKey: "inTransit",
    header: "In Transit",
    kind: "integer",
    cell: "mono",
  },
  {
    accessorKey: "receipts",
    header: "Receipts",
    kind: "integer",
    cell: "fbaReceiptsGreen",
  },
  {
    accessorKey: "customerShipments",
    header: "Cust Shipped",
    kind: "integer",
    cell: "fbaCustShippedRed",
  },
  {
    accessorKey: "customerReturns",
    header: "Cust Returns",
    kind: "integer",
    cell: "fbaCustReturnsYellow",
  },
  {
    accessorKey: "vendorReturns",
    header: "Vendor Returns",
    kind: "integer",
    cell: "fbaVendorPurple",
  },
  {
    accessorKey: "warehouseTransfer",
    header: "Transfers",
    kind: "integer",
    cell: "fbaTransferMono",
  },
  {
    accessorKey: "found",
    header: "Found",
    kind: "integer",
    cell: "fbaFoundGreen",
  },
  {
    accessorKey: "lost",
    header: "Lost",
    kind: "integer",
    cell: "fbaLostRed",
  },
  {
    accessorKey: "damaged",
    header: "Damaged",
    kind: "integer",
    cell: "fbaDamagedOrange",
  },
  {
    accessorKey: "disposedQty",
    header: "Disposed",
    kind: "integer",
    cell: "fbaDisposedOrange",
  },
  {
    accessorKey: "otherEvents",
    header: "Other Events",
    kind: "integer",
    cell: "fbaOtherOrange",
  },
  {
    accessorKey: "endingBalance",
    header: "End Balance",
    kind: "integer",
    cell: "fbaEndBlueBold",
  },
  {
    accessorKey: "unknownEvents",
    header: "Unknown Events",
    kind: "integer",
    cell: "fbaUnknownOrange",
  },
  { accessorKey: "location", header: "Location", kind: "text", cell: "mono" },
  { accessorKey: "store", header: "Store", kind: "text", cell: "mono" },
];

const FBA_SUMMARY_SUMMARY: ExplorerColumnSpec[] = [
  { accessorKey: "fnsku", header: "FNSKU", kind: "text", cell: "mono" },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  { accessorKey: "title", header: "Title", kind: "text" },
  {
    accessorKey: "openingBalance",
    header: "Opening Balance",
    kind: "integer",
    cell: "fbaSummaryOpeningGreen",
  },
  {
    accessorKey: "custShipped",
    header: "Cust Shipped",
    kind: "integer",
    cell: "fbaSummaryShippedRed",
  },
  {
    accessorKey: "custReturns",
    header: "Cust Returns",
    kind: "integer",
    cell: "fbaSummaryCretTeal",
  },
  {
    accessorKey: "vendorReturns",
    header: "Vendor Returns",
    kind: "integer",
    cell: "fbaSummaryVretPurple",
  },
  {
    accessorKey: "transfers",
    header: "Transfers",
    kind: "integer",
    cell: "mono",
  },
  { accessorKey: "found", header: "Found", kind: "integer", cell: "mono" },
  { accessorKey: "lost", header: "Lost", kind: "integer", cell: "mono" },
  {
    accessorKey: "damaged",
    header: "Damaged",
    kind: "integer",
    cell: "mono",
  },
  {
    accessorKey: "disposed",
    header: "Disposed",
    kind: "integer",
    cell: "mono",
  },
  {
    accessorKey: "otherEvents",
    header: "Other Events",
    kind: "integer",
    cell: "mono",
  },
  {
    accessorKey: "unknownEvents",
    header: "Unknown Events",
    kind: "integer",
    cell: "mono",
  },
  {
    accessorKey: "adjustment",
    header: "Adjustment",
    kind: "integer",
    cell: "integerRight",
  },
  {
    accessorKey: "endingBalance",
    header: "Ending Balance",
    kind: "integer",
    cell: "fbaSummaryEndBold",
  },
];

const REPLACEMENTS: ExplorerColumnSpec[] = [
  {
    accessorKey: "shipmentDate",
    header: "Shipment Date",
    kind: "date",
    cell: "mono",
  },
  {
    accessorKey: "orderId",
    header: "Order ID",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "originalOrderId",
    header: "Original Order ID",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  {
    accessorKey: "quantity",
    header: "Qty",
    kind: "integer",
    cell: "qtyBoldRight",
  },
  {
    accessorKey: "replacementReasonCode",
    header: "Replacement Reason Code",
    kind: "text",
  },
  {
    accessorKey: "fulfillmentCenter",
    header: "Fulfillment Center",
    kind: "text",
  },
  { accessorKey: "store", header: "Store", kind: "text", cell: "mono" },
];

const ADJUSTMENTS: ExplorerColumnSpec[] = [
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  {
    accessorKey: "flag",
    header: "Flag",
    kind: "text",
    cell: "chipGrey",
  },
  {
    accessorKey: "quantity",
    header: "Quantity",
    kind: "integer",
    cell: "qtyGreen",
  },
  { accessorKey: "store", header: "Store", kind: "text" },
  {
    accessorKey: "uploadedAt",
    header: "Uploaded At",
    kind: "date",
    cell: "mono",
  },
];

const GNR_REPORT: ExplorerColumnSpec[] = [
  {
    accessorKey: "reportDate",
    header: "Report Date",
    kind: "date",
    cell: "mono",
  },
  {
    accessorKey: "orderId",
    header: "Order ID",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "msku",
    header: "MSKU",
    kind: "text",
    cell: "mono10bold",
  },
  { accessorKey: "fnsku", header: "FNSKU", kind: "text", cell: "mono" },
  {
    accessorKey: "usedMsku",
    header: "Used MSKU",
    kind: "text",
    cell: "mono",
  },
  {
    accessorKey: "usedFnsku",
    header: "Used FNSKU",
    kind: "text",
    cell: "mono",
  },
  { accessorKey: "asin", header: "ASIN", kind: "text", cell: "mono" },
  {
    accessorKey: "quantity",
    header: "Qty",
    kind: "integer",
    cell: "qtyBoldRight",
  },
  {
    accessorKey: "unitStatus",
    header: "Unit Status",
    kind: "text",
    cell: "chipUnitStatus",
  },
  {
    accessorKey: "reasonForUnitStatus",
    header: "Reason For Status",
    kind: "text",
  },
  {
    accessorKey: "usedCondition",
    header: "Used Condition",
    kind: "text",
  },
  {
    accessorKey: "valueRecoveryType",
    header: "Value Recovery Type",
    kind: "text",
  },
  { accessorKey: "lpn", header: "LPN", kind: "text", cell: "mono" },
  { accessorKey: "store", header: "Store", kind: "text", cell: "mono" },
];

const PAYMENT_REPOSITORY: ExplorerColumnSpec[] = [
  {
    accessorKey: "postedDatetime",
    header: "Posted DateTime",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "settlementId",
    header: "Settlement ID",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "lineType",
    header: "Line Type",
    kind: "text",
    cell: "truncate140",
  },
  {
    accessorKey: "orderId",
    header: "Order ID",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "sku",
    header: "SKU",
    kind: "text",
    cell: "mono10",
  },
  {
    accessorKey: "description",
    header: "Description",
    kind: "text",
    cell: "truncate160",
  },
  {
    accessorKey: "quantity",
    header: "Qty",
    kind: "integer",
    cell: "mono",
  },
  {
    accessorKey: "marketplace",
    header: "Marketplace",
    kind: "text",
    cell: "chipGrey",
  },
  {
    accessorKey: "productSales",
    header: "Product $",
    kind: "money",
    cell: "moneyRight",
  },
  {
    accessorKey: "sellingFees",
    header: "Selling Fees",
    kind: "money",
    cell: "moneyRight",
  },
  {
    accessorKey: "fbaFees",
    header: "FBA Fees",
    kind: "money",
    cell: "moneyRight",
  },
  {
    accessorKey: "total",
    header: "Total",
    kind: "money",
    cell: "moneyRightBold",
  },
  {
    accessorKey: "transactionStatus",
    header: "Status",
    kind: "text",
    cell: "chipStatus",
  },
];

export const DATA_EXPLORER_TAB_COLUMNS: Record<
  DataExplorerTabId,
  ExplorerColumnSpec[]
> = {
  shipped_to_fba: SHIPPED_TO_FBA,
  shipped_cost: SHIPPED_COST,
  sales_data: SALES_BY_FNSKU,
  fba_receipts: FBA_RECEIPTS,
  customer_returns: CUSTOMER_RETURNS,
  reimbursements: REIMBURSEMENTS,
  fba_removals: FBA_REMOVALS,
  fc_transfers: FC_TRANSFERS,
  shipment_status: SHIPMENT_STATUS,
  fba_summary: FBA_SUMMARY_DETAILS,
  replacements: REPLACEMENTS,
  adjustments: ADJUSTMENTS,
  gnr_report: GNR_REPORT,
  payment_repository: PAYMENT_REPOSITORY,
};

export function getDataExplorerColumns(
  tab: DataExplorerTabId,
  opts?: {
    salesView?: "fnsku" | "asin";
    fbaSummaryView?: "details" | "summary";
  },
): ExplorerColumnSpec[] {
  if (tab === "sales_data" && opts?.salesView === "asin") {
    return SALES_BY_ASIN;
  }
  if (tab === "fba_summary" && opts?.fbaSummaryView === "summary") {
    return FBA_SUMMARY_SUMMARY;
  }
  return DATA_EXPLORER_TAB_COLUMNS[tab];
}

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    spec?: ExplorerColumnSpec;
  }
}
