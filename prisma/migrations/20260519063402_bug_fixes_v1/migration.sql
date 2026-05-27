/*
  Warnings:

  - The primary key for the `full_recon_remarks` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `settlement_start_date` column on the `settlement_report` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `settlement_end_date` column on the `settlement_report` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `deposit_date` column on the `settlement_report` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `posted_date` column on the `settlement_report` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `posted_date_time` column on the `settlement_report` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[msku,store]` on the table `adjustments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[fnsku,store]` on the table `full_recon_remarks` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orderId,fnsku,trackingNumber,receivedDate]` on the table `removal_receipts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orderId,fnsku,saleDate]` on the table `sales_data` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `full_recon_remarks` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropIndex
DROP INDEX "adjustments_msku_key";

-- DropIndex
DROP INDEX "sales_data_orderId_saleDate_key";

-- AlterTable
ALTER TABLE "full_recon_remarks" DROP CONSTRAINT "full_recon_remarks_pkey",
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "store" TEXT,
ADD CONSTRAINT "full_recon_remarks_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "settlement_report" DROP COLUMN "settlement_start_date",
ADD COLUMN     "settlement_start_date" TIMESTAMP(3),
DROP COLUMN "settlement_end_date",
ADD COLUMN     "settlement_end_date" TIMESTAMP(3),
DROP COLUMN "deposit_date",
ADD COLUMN     "deposit_date" TIMESTAMP(3),
DROP COLUMN "posted_date",
ADD COLUMN     "posted_date" TIMESTAMP(3),
DROP COLUMN "posted_date_time",
ADD COLUMN     "posted_date_time" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "adjustments_msku_store_key" ON "adjustments"("msku", "store");

-- CreateIndex
CREATE INDEX "full_recon_remarks_fnsku_idx" ON "full_recon_remarks"("fnsku");

-- CreateIndex
CREATE UNIQUE INDEX "full_recon_remarks_fnsku_store_key" ON "full_recon_remarks"("fnsku", "store");

-- CreateIndex
CREATE UNIQUE INDEX "removal_receipts_orderId_fnsku_trackingNumber_receivedDate_key" ON "removal_receipts"("orderId", "fnsku", "trackingNumber", "receivedDate");

-- CreateIndex
CREATE UNIQUE INDEX "sales_data_orderId_fnsku_saleDate_key" ON "sales_data"("orderId", "fnsku", "saleDate");

-- CreateIndex
CREATE INDEX "settlement_report_posted_date_idx" ON "settlement_report"("posted_date");
