-- AlterTable
ALTER TABLE "inbound_shipments" ADD COLUMN "settledTransport" DECIMAL(12,2),
ADD COLUMN "settledPlacement" DECIMAL(12,2),
ADD COLUMN "settlementIds" TEXT;
