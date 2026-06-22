-- CreateTable
CREATE TABLE "inbound_shipments" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "manual_proc_fee" DECIMAL(12,2),
    "placement_fee" DECIMAL(12,2),
    "partnered_carrier" DECIMAL(12,2),
    "notes" TEXT,
    "store" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "inbound_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbound_shipments_shipmentId_idx" ON "inbound_shipments"("shipmentId");

-- CreateIndex
CREATE INDEX "inbound_shipments_store_idx" ON "inbound_shipments"("store");
