-- AlterEnum
ALTER TYPE "ReconType" ADD VALUE 'ADJUSTMENT';

-- AlterTable
ALTER TABLE "manual_adjustments" ADD COLUMN     "amount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" TEXT NOT NULL,
    "adj_date" DATE,
    "fnsku" TEXT,
    "asin" TEXT,
    "msku" TEXT,
    "title" TEXT,
    "event_type" TEXT,
    "reference_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "fulfillment_center" TEXT,
    "disposition" TEXT,
    "reason" TEXT,
    "country" TEXT,
    "reconciled_qty" INTEGER NOT NULL DEFAULT 0,
    "unreconciled_qty" INTEGER NOT NULL DEFAULT 0,
    "adj_datetime" TIMESTAMP(3),
    "store" TEXT,
    "row_hash" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_adjustments_msku_idx" ON "inventory_adjustments"("msku");

-- CreateIndex
CREATE INDEX "inventory_adjustments_fnsku_idx" ON "inventory_adjustments"("fnsku");

-- CreateIndex
CREATE INDEX "inventory_adjustments_asin_idx" ON "inventory_adjustments"("asin");

-- CreateIndex
CREATE INDEX "inventory_adjustments_reference_id_idx" ON "inventory_adjustments"("reference_id");

-- CreateIndex
CREATE INDEX "inventory_adjustments_adj_date_idx" ON "inventory_adjustments"("adj_date");

-- CreateIndex
CREATE INDEX "inventory_adjustments_store_idx" ON "inventory_adjustments"("store");

-- CreateIndex
CREATE INDEX "inventory_adjustments_row_hash_idx" ON "inventory_adjustments"("row_hash");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_adjustments_reference_id_fnsku_adj_date_quantity_key" ON "inventory_adjustments"("reference_id", "fnsku", "adj_date", "quantity");
