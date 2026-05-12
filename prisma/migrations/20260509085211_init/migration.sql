-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VENDOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReconType" AS ENUM ('SHIPMENT', 'REMOVAL', 'RETURN', 'FC_TRANSFER', 'REIMBURSEMENT', 'FBA_BALANCE', 'GNR', 'REPLACEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "AdjType" AS ENUM ('QUANTITY', 'FINANCIAL', 'STATUS', 'OTHER');

-- CreateEnum
CREATE TYPE "GradeResellStatus" AS ENUM ('PENDING', 'GRADED', 'LISTED', 'SOLD', 'RETURNED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "WareHouseStatus" AS ENUM ('PENDING', 'RECEIVED', 'PROCESSED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "RemovalReceiptStatus" AS ENUM ('AWAITING', 'PARTIAL', 'COMPLETE', 'MISSING', 'DAMAGED', 'REIMBURSED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "FinalStatus" AS ENUM ('OPEN', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipped_to_fba" (
    "id" TEXT NOT NULL,
    "msku" TEXT NOT NULL,
    "title" TEXT,
    "asin" TEXT,
    "fnsku" TEXT,
    "shipDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "shipmentId" TEXT,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "shipped_to_fba_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_data" (
    "id" TEXT NOT NULL,
    "msku" TEXT,
    "fnsku" TEXT,
    "asin" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "saleDate" TIMESTAMP(3),
    "orderId" TEXT,
    "currency" TEXT,
    "productAmount" DECIMAL(12,2),
    "shippingAmount" DECIMAL(12,2),
    "giftAmount" DECIMAL(12,2),
    "fc" TEXT,
    "shipCity" TEXT,
    "shipState" TEXT,
    "shipPostalCode" TEXT,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sales_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fba_receipts" (
    "id" TEXT NOT NULL,
    "msku" TEXT,
    "title" TEXT,
    "asin" TEXT,
    "fnsku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "receiptDate" TIMESTAMP(3),
    "shipmentId" TEXT,
    "eventType" TEXT,
    "fulfillmentCenter" TEXT,
    "disposition" TEXT,
    "reason" TEXT,
    "country" TEXT,
    "reconciledQty" INTEGER NOT NULL DEFAULT 0,
    "unreconciledQty" INTEGER NOT NULL DEFAULT 0,
    "receiptDatetime" TIMESTAMP(3),
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fba_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_returns" (
    "id" TEXT NOT NULL,
    "msku" TEXT,
    "asin" TEXT,
    "fnsku" TEXT,
    "title" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "disposition" TEXT,
    "detailedDisposition" TEXT,
    "reason" TEXT,
    "status" TEXT,
    "returnDate" TIMESTAMP(3),
    "orderId" TEXT,
    "fulfillmentCenter" TEXT,
    "licensePlateNumber" TEXT,
    "customerComments" TEXT,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customer_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursements" (
    "id" TEXT NOT NULL,
    "msku" TEXT,
    "fnsku" TEXT,
    "asin" TEXT,
    "title" TEXT,
    "reason" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2),
    "reimbursementId" TEXT,
    "approvalDate" TIMESTAMP(3),
    "caseId" TEXT,
    "amazonOrderId" TEXT,
    "conditionVal" TEXT,
    "currency" TEXT,
    "amountPerUnit" DECIMAL(12,2),
    "qtyCash" INTEGER NOT NULL DEFAULT 0,
    "qtyInventory" INTEGER NOT NULL DEFAULT 0,
    "originalReimbId" TEXT,
    "originalReimbType" TEXT,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "reimbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fba_removals" (
    "id" TEXT NOT NULL,
    "msku" TEXT,
    "fnsku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "disposition" TEXT,
    "orderStatus" TEXT,
    "orderId" TEXT,
    "requestDate" TIMESTAMP(3),
    "orderSource" TEXT,
    "orderType" TEXT,
    "lastUpdated" TIMESTAMP(3),
    "cancelledQty" INTEGER NOT NULL DEFAULT 0,
    "disposedQty" INTEGER NOT NULL DEFAULT 0,
    "inProcessQty" INTEGER NOT NULL DEFAULT 0,
    "removalFee" DECIMAL(12,2),
    "currency" TEXT,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fba_removals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fc_transfers" (
    "id" TEXT NOT NULL,
    "msku" TEXT,
    "fnsku" TEXT,
    "asin" TEXT,
    "title" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "transferDate" TIMESTAMP(3),
    "eventType" TEXT,
    "referenceId" TEXT,
    "fulfillmentCenter" TEXT,
    "disposition" TEXT,
    "reason" TEXT,
    "country" TEXT,
    "reconciledQty" INTEGER NOT NULL DEFAULT 0,
    "unreconciledQty" INTEGER NOT NULL DEFAULT 0,
    "transferDatetime" TIMESTAMP(3),
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fc_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_status" (
    "id" TEXT NOT NULL,
    "shipmentName" TEXT,
    "shipmentId" TEXT,
    "createdDate" TIMESTAMP(3),
    "lastUpdated" TIMESTAMP(3),
    "shipTo" TEXT,
    "totalSkus" INTEGER NOT NULL DEFAULT 0,
    "unitsExpected" INTEGER NOT NULL DEFAULT 0,
    "unitsLocated" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "shipment_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fba_summary" (
    "id" TEXT NOT NULL,
    "msku" TEXT,
    "fnsku" TEXT,
    "asin" TEXT,
    "title" TEXT,
    "disposition" TEXT,
    "endingBalance" INTEGER NOT NULL DEFAULT 0,
    "startingBalance" INTEGER NOT NULL DEFAULT 0,
    "inTransit" INTEGER NOT NULL DEFAULT 0,
    "receipts" INTEGER NOT NULL DEFAULT 0,
    "customerShipments" INTEGER NOT NULL DEFAULT 0,
    "customerReturns" INTEGER NOT NULL DEFAULT 0,
    "vendorReturns" INTEGER NOT NULL DEFAULT 0,
    "warehouseTransfer" INTEGER NOT NULL DEFAULT 0,
    "found" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "disposedQty" INTEGER NOT NULL DEFAULT 0,
    "otherEvents" INTEGER NOT NULL DEFAULT 0,
    "unknownEvents" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "store" TEXT,
    "summaryDate" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fba_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replacements" (
    "id" TEXT NOT NULL,
    "msku" TEXT,
    "asin" TEXT,
    "orderId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "shipmentDate" TIMESTAMP(3),
    "fulfillmentCenterId" TEXT,
    "originalFulfillmentCenterId" TEXT,
    "replacementReasonCode" TEXT,
    "replacementOrderId" TEXT,
    "originalOrderId" TEXT,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "replacements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjustments" (
    "id" TEXT NOT NULL,
    "msku" TEXT NOT NULL,
    "flag" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "removal_shipments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "requestDate" TIMESTAMP(3),
    "shipmentDate" TIMESTAMP(3),
    "msku" TEXT,
    "fnsku" TEXT,
    "disposition" TEXT,
    "shippedQty" INTEGER NOT NULL DEFAULT 0,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "removalOrderType" TEXT,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "removal_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "removal_receipts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "fnsku" TEXT,
    "msku" TEXT,
    "trackingNumber" TEXT,
    "carrier" TEXT,
    "expectedQty" INTEGER NOT NULL DEFAULT 0,
    "receivedDate" TIMESTAMP(3),
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "sellableQty" INTEGER NOT NULL DEFAULT 0,
    "unsellableQty" INTEGER NOT NULL DEFAULT 0,
    "conditionReceived" TEXT,
    "missingQty" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "receivedBy" TEXT,
    "status" "RemovalReceiptStatus" NOT NULL DEFAULT 'AWAITING',
    "warehouseComment" TEXT,
    "transferTo" TEXT,
    "whStatus" "WareHouseStatus" NOT NULL DEFAULT 'PENDING',
    "sellerStatus" TEXT,
    "sellerComments" TEXT,
    "warehouseBilled" BOOLEAN NOT NULL DEFAULT false,
    "billedDate" TIMESTAMP(3),
    "billedAmount" DECIMAL(12,2),
    "wrongItemReceived" BOOLEAN NOT NULL DEFAULT false,
    "wrongItemNotes" TEXT,
    "reimbQty" INTEGER NOT NULL DEFAULT 0,
    "reimbAmount" DECIMAL(12,2),
    "postAction" TEXT,
    "actionRemarks" TEXT,
    "actionDate" TIMESTAMP(3),
    "finalStatus" "FinalStatus" NOT NULL DEFAULT 'OPEN',
    "caseId" TEXT,
    "caseType" TEXT,
    "caseRaisedAt" TIMESTAMP(3),
    "caseTrackerId" TEXT,
    "store" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "removal_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gnr_report" (
    "id" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3),
    "orderId" TEXT,
    "valueRecoveryType" TEXT,
    "lpn" TEXT,
    "manualOrderItemId" TEXT,
    "msku" TEXT,
    "fnsku" TEXT,
    "asin" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitStatus" TEXT,
    "reasonForUnitStatus" TEXT,
    "usedCondition" TEXT,
    "usedMsku" TEXT,
    "usedFnsku" TEXT,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "gnr_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_resell_items" (
    "id" TEXT NOT NULL,
    "source" TEXT,
    "sourceRef" TEXT,
    "msku" TEXT NOT NULL,
    "fnsku" TEXT,
    "asin" TEXT,
    "title" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "grade" TEXT,
    "resellPrice" DECIMAL(12,2),
    "channel" TEXT,
    "status" "GradeResellStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "gradedBy" TEXT,
    "gradedDate" TIMESTAMP(3),
    "soldDate" TIMESTAMP(3),
    "soldPrice" DECIMAL(12,2),
    "orderId" TEXT,
    "lpn" TEXT,
    "usedMsku" TEXT,
    "usedFnsku" TEXT,
    "usedCondition" TEXT,
    "unitStatus" TEXT,
    "store" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "grade_resell_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_repository" (
    "id" TEXT NOT NULL,
    "postedDatetime" TEXT,
    "settlementId" TEXT,
    "lineType" TEXT,
    "orderId" TEXT,
    "sku" TEXT,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "marketplace" TEXT,
    "accountType" TEXT,
    "fulfillmentId" TEXT,
    "taxCollectionModel" TEXT,
    "productSales" DECIMAL(12,2),
    "productSalesTax" DECIMAL(12,2),
    "shippingCredits" DECIMAL(12,2),
    "shippingCreditsTax" DECIMAL(12,2),
    "giftWrapCredits" DECIMAL(12,2),
    "giftWrapCreditsTax" DECIMAL(12,2),
    "promotionalRebates" DECIMAL(12,2),
    "promotionalRebatesTax" DECIMAL(12,2),
    "marketplaceWithheldTax" DECIMAL(12,2),
    "sellingFees" DECIMAL(12,2),
    "fbaFees" DECIMAL(12,2),
    "otherTransactionFees" DECIMAL(12,2),
    "other" DECIMAL(12,2),
    "total" DECIMAL(12,2),
    "transactionStatus" TEXT,
    "transactionReleaseDatetime" TEXT,
    "store" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payment_repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_tracker" (
    "id" TEXT NOT NULL,
    "msku" TEXT,
    "asin" TEXT,
    "fnsku" TEXT,
    "title" TEXT,
    "reconType" "ReconType" NOT NULL,
    "shipmentId" TEXT,
    "orderId" TEXT,
    "referenceId" TEXT,
    "caseReason" TEXT,
    "unitsClaimed" INTEGER NOT NULL DEFAULT 0,
    "unitsApproved" INTEGER NOT NULL DEFAULT 0,
    "amountClaimed" DECIMAL(12,2),
    "amountApproved" DECIMAL(12,2),
    "currency" TEXT DEFAULT 'USD',
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "issueDate" TIMESTAMP(3),
    "raisedDate" TIMESTAMP(3),
    "resolvedDate" TIMESTAMP(3),
    "notes" TEXT,
    "store" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "case_tracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_adjustments" (
    "id" TEXT NOT NULL,
    "msku" TEXT,
    "asin" TEXT,
    "fnsku" TEXT,
    "title" TEXT,
    "reconType" "ReconType" NOT NULL,
    "shipmentId" TEXT,
    "orderId" TEXT,
    "referenceId" TEXT,
    "adjType" "AdjType" NOT NULL DEFAULT 'QUANTITY',
    "qtyBefore" INTEGER NOT NULL DEFAULT 0,
    "qtyAdjusted" INTEGER NOT NULL DEFAULT 0,
    "qtyAfter" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "verifiedBy" TEXT,
    "sourceDoc" TEXT,
    "notes" TEXT,
    "adjDate" TIMESTAMP(3),
    "store" TEXT,
    "caseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "manual_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_summary" (
    "id" TEXT NOT NULL,
    "msku" TEXT NOT NULL,
    "fnsku" TEXT,
    "asin" TEXT,
    "title" TEXT,
    "store" TEXT,
    "shippedQty" INTEGER NOT NULL DEFAULT 0,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "soldQty" INTEGER NOT NULL DEFAULT 0,
    "returnQty" INTEGER NOT NULL DEFAULT 0,
    "reimbQty" INTEGER NOT NULL DEFAULT 0,
    "removalQty" INTEGER NOT NULL DEFAULT 0,
    "fcTransferQty" INTEGER NOT NULL DEFAULT 0,
    "fbaEndingBalance" INTEGER NOT NULL DEFAULT 0,
    "expectedQty" INTEGER NOT NULL DEFAULT 0,
    "actualQty" INTEGER NOT NULL DEFAULT 0,
    "variance" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "uploaded_files_reportType_idx" ON "uploaded_files"("reportType");

-- CreateIndex
CREATE INDEX "uploaded_files_uploadedAt_idx" ON "uploaded_files"("uploadedAt");

-- CreateIndex
CREATE INDEX "uploaded_files_store_idx" ON "uploaded_files"("store");

-- CreateIndex
CREATE INDEX "shipped_to_fba_msku_idx" ON "shipped_to_fba"("msku");

-- CreateIndex
CREATE INDEX "shipped_to_fba_fnsku_idx" ON "shipped_to_fba"("fnsku");

-- CreateIndex
CREATE INDEX "shipped_to_fba_asin_idx" ON "shipped_to_fba"("asin");

-- CreateIndex
CREATE INDEX "shipped_to_fba_shipmentId_idx" ON "shipped_to_fba"("shipmentId");

-- CreateIndex
CREATE INDEX "shipped_to_fba_store_idx" ON "shipped_to_fba"("store");

-- CreateIndex
CREATE INDEX "shipped_to_fba_shipDate_idx" ON "shipped_to_fba"("shipDate");

-- CreateIndex
CREATE INDEX "sales_data_msku_idx" ON "sales_data"("msku");

-- CreateIndex
CREATE INDEX "sales_data_fnsku_idx" ON "sales_data"("fnsku");

-- CreateIndex
CREATE INDEX "sales_data_asin_idx" ON "sales_data"("asin");

-- CreateIndex
CREATE INDEX "sales_data_orderId_idx" ON "sales_data"("orderId");

-- CreateIndex
CREATE INDEX "sales_data_saleDate_idx" ON "sales_data"("saleDate");

-- CreateIndex
CREATE INDEX "sales_data_store_idx" ON "sales_data"("store");

-- CreateIndex
CREATE INDEX "fba_receipts_msku_idx" ON "fba_receipts"("msku");

-- CreateIndex
CREATE INDEX "fba_receipts_fnsku_idx" ON "fba_receipts"("fnsku");

-- CreateIndex
CREATE INDEX "fba_receipts_shipmentId_idx" ON "fba_receipts"("shipmentId");

-- CreateIndex
CREATE INDEX "fba_receipts_store_idx" ON "fba_receipts"("store");

-- CreateIndex
CREATE INDEX "fba_receipts_receiptDate_idx" ON "fba_receipts"("receiptDate");

-- CreateIndex
CREATE INDEX "customer_returns_msku_idx" ON "customer_returns"("msku");

-- CreateIndex
CREATE INDEX "customer_returns_fnsku_idx" ON "customer_returns"("fnsku");

-- CreateIndex
CREATE INDEX "customer_returns_asin_idx" ON "customer_returns"("asin");

-- CreateIndex
CREATE INDEX "customer_returns_orderId_idx" ON "customer_returns"("orderId");

-- CreateIndex
CREATE INDEX "customer_returns_returnDate_idx" ON "customer_returns"("returnDate");

-- CreateIndex
CREATE INDEX "customer_returns_store_idx" ON "customer_returns"("store");

-- CreateIndex
CREATE INDEX "reimbursements_msku_idx" ON "reimbursements"("msku");

-- CreateIndex
CREATE INDEX "reimbursements_fnsku_idx" ON "reimbursements"("fnsku");

-- CreateIndex
CREATE INDEX "reimbursements_asin_idx" ON "reimbursements"("asin");

-- CreateIndex
CREATE INDEX "reimbursements_amazonOrderId_idx" ON "reimbursements"("amazonOrderId");

-- CreateIndex
CREATE INDEX "reimbursements_reason_idx" ON "reimbursements"("reason");

-- CreateIndex
CREATE INDEX "reimbursements_store_idx" ON "reimbursements"("store");

-- CreateIndex
CREATE INDEX "reimbursements_approvalDate_idx" ON "reimbursements"("approvalDate");

-- CreateIndex
CREATE INDEX "fba_removals_msku_idx" ON "fba_removals"("msku");

-- CreateIndex
CREATE INDEX "fba_removals_fnsku_idx" ON "fba_removals"("fnsku");

-- CreateIndex
CREATE INDEX "fba_removals_orderId_idx" ON "fba_removals"("orderId");

-- CreateIndex
CREATE INDEX "fba_removals_store_idx" ON "fba_removals"("store");

-- CreateIndex
CREATE INDEX "fba_removals_requestDate_idx" ON "fba_removals"("requestDate");

-- CreateIndex
CREATE INDEX "fc_transfers_msku_idx" ON "fc_transfers"("msku");

-- CreateIndex
CREATE INDEX "fc_transfers_fnsku_idx" ON "fc_transfers"("fnsku");

-- CreateIndex
CREATE INDEX "fc_transfers_referenceId_idx" ON "fc_transfers"("referenceId");

-- CreateIndex
CREATE INDEX "fc_transfers_store_idx" ON "fc_transfers"("store");

-- CreateIndex
CREATE INDEX "fc_transfers_transferDate_idx" ON "fc_transfers"("transferDate");

-- CreateIndex
CREATE INDEX "shipment_status_shipmentId_idx" ON "shipment_status"("shipmentId");

-- CreateIndex
CREATE INDEX "shipment_status_status_idx" ON "shipment_status"("status");

-- CreateIndex
CREATE INDEX "shipment_status_store_idx" ON "shipment_status"("store");

-- CreateIndex
CREATE INDEX "fba_summary_msku_idx" ON "fba_summary"("msku");

-- CreateIndex
CREATE INDEX "fba_summary_fnsku_idx" ON "fba_summary"("fnsku");

-- CreateIndex
CREATE INDEX "fba_summary_asin_idx" ON "fba_summary"("asin");

-- CreateIndex
CREATE INDEX "fba_summary_store_idx" ON "fba_summary"("store");

-- CreateIndex
CREATE INDEX "fba_summary_summaryDate_idx" ON "fba_summary"("summaryDate");

-- CreateIndex
CREATE INDEX "replacements_msku_idx" ON "replacements"("msku");

-- CreateIndex
CREATE INDEX "replacements_asin_idx" ON "replacements"("asin");

-- CreateIndex
CREATE INDEX "replacements_orderId_idx" ON "replacements"("orderId");

-- CreateIndex
CREATE INDEX "replacements_originalOrderId_idx" ON "replacements"("originalOrderId");

-- CreateIndex
CREATE INDEX "replacements_store_idx" ON "replacements"("store");

-- CreateIndex
CREATE INDEX "adjustments_msku_idx" ON "adjustments"("msku");

-- CreateIndex
CREATE INDEX "adjustments_store_idx" ON "adjustments"("store");

-- CreateIndex
CREATE INDEX "removal_shipments_orderId_idx" ON "removal_shipments"("orderId");

-- CreateIndex
CREATE INDEX "removal_shipments_msku_idx" ON "removal_shipments"("msku");

-- CreateIndex
CREATE INDEX "removal_shipments_fnsku_idx" ON "removal_shipments"("fnsku");

-- CreateIndex
CREATE INDEX "removal_shipments_store_idx" ON "removal_shipments"("store");

-- CreateIndex
CREATE UNIQUE INDEX "removal_shipments_orderId_fnsku_trackingNumber_key" ON "removal_shipments"("orderId", "fnsku", "trackingNumber");

-- CreateIndex
CREATE INDEX "removal_receipts_orderId_idx" ON "removal_receipts"("orderId");

-- CreateIndex
CREATE INDEX "removal_receipts_fnsku_idx" ON "removal_receipts"("fnsku");

-- CreateIndex
CREATE INDEX "removal_receipts_msku_idx" ON "removal_receipts"("msku");

-- CreateIndex
CREATE INDEX "removal_receipts_trackingNumber_idx" ON "removal_receipts"("trackingNumber");

-- CreateIndex
CREATE INDEX "removal_receipts_status_idx" ON "removal_receipts"("status");

-- CreateIndex
CREATE INDEX "removal_receipts_store_idx" ON "removal_receipts"("store");

-- CreateIndex
CREATE INDEX "gnr_report_msku_idx" ON "gnr_report"("msku");

-- CreateIndex
CREATE INDEX "gnr_report_fnsku_idx" ON "gnr_report"("fnsku");

-- CreateIndex
CREATE INDEX "gnr_report_usedMsku_idx" ON "gnr_report"("usedMsku");

-- CreateIndex
CREATE INDEX "gnr_report_usedFnsku_idx" ON "gnr_report"("usedFnsku");

-- CreateIndex
CREATE INDEX "gnr_report_orderId_idx" ON "gnr_report"("orderId");

-- CreateIndex
CREATE INDEX "gnr_report_store_idx" ON "gnr_report"("store");

-- CreateIndex
CREATE INDEX "grade_resell_items_msku_idx" ON "grade_resell_items"("msku");

-- CreateIndex
CREATE INDEX "grade_resell_items_fnsku_idx" ON "grade_resell_items"("fnsku");

-- CreateIndex
CREATE INDEX "grade_resell_items_status_idx" ON "grade_resell_items"("status");

-- CreateIndex
CREATE INDEX "grade_resell_items_store_idx" ON "grade_resell_items"("store");

-- CreateIndex
CREATE UNIQUE INDEX "grade_resell_items_usedMsku_usedFnsku_key" ON "grade_resell_items"("usedMsku", "usedFnsku");

-- CreateIndex
CREATE INDEX "payment_repository_orderId_idx" ON "payment_repository"("orderId");

-- CreateIndex
CREATE INDEX "payment_repository_sku_idx" ON "payment_repository"("sku");

-- CreateIndex
CREATE INDEX "payment_repository_settlementId_idx" ON "payment_repository"("settlementId");

-- CreateIndex
CREATE INDEX "payment_repository_store_idx" ON "payment_repository"("store");

-- CreateIndex
CREATE INDEX "case_tracker_msku_idx" ON "case_tracker"("msku");

-- CreateIndex
CREATE INDEX "case_tracker_fnsku_idx" ON "case_tracker"("fnsku");

-- CreateIndex
CREATE INDEX "case_tracker_asin_idx" ON "case_tracker"("asin");

-- CreateIndex
CREATE INDEX "case_tracker_reconType_idx" ON "case_tracker"("reconType");

-- CreateIndex
CREATE INDEX "case_tracker_status_idx" ON "case_tracker"("status");

-- CreateIndex
CREATE INDEX "case_tracker_shipmentId_idx" ON "case_tracker"("shipmentId");

-- CreateIndex
CREATE INDEX "case_tracker_orderId_idx" ON "case_tracker"("orderId");

-- CreateIndex
CREATE INDEX "case_tracker_store_idx" ON "case_tracker"("store");

-- CreateIndex
CREATE INDEX "manual_adjustments_msku_idx" ON "manual_adjustments"("msku");

-- CreateIndex
CREATE INDEX "manual_adjustments_fnsku_idx" ON "manual_adjustments"("fnsku");

-- CreateIndex
CREATE INDEX "manual_adjustments_reconType_idx" ON "manual_adjustments"("reconType");

-- CreateIndex
CREATE INDEX "manual_adjustments_caseId_idx" ON "manual_adjustments"("caseId");

-- CreateIndex
CREATE INDEX "manual_adjustments_store_idx" ON "manual_adjustments"("store");

-- CreateIndex
CREATE INDEX "reconciliation_summary_msku_idx" ON "reconciliation_summary"("msku");

-- CreateIndex
CREATE INDEX "reconciliation_summary_fnsku_idx" ON "reconciliation_summary"("fnsku");

-- CreateIndex
CREATE INDEX "reconciliation_summary_status_idx" ON "reconciliation_summary"("status");

-- CreateIndex
CREATE INDEX "reconciliation_summary_store_idx" ON "reconciliation_summary"("store");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_summary_msku_store_key" ON "reconciliation_summary"("msku", "store");

-- AddForeignKey
ALTER TABLE "manual_adjustments" ADD CONSTRAINT "manual_adjustments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "case_tracker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
