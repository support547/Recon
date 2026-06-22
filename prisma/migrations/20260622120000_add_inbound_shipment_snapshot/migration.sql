-- AlterTable
ALTER TABLE "inbound_shipments" ADD COLUMN "shipmentName" TEXT,
ADD COLUMN "createdDate" TIMESTAMP(3),
ADD COLUMN "lastUpdated" TIMESTAMP(3),
ADD COLUMN "unitsLocated" INTEGER,
ADD COLUMN "shipmentStatus" TEXT,
ADD COLUMN "shipTo" TEXT;
