
-- DropIndex
DROP INDEX "shipped_to_fba_shipmentId_msku_fnsku_shipDate_key";

-- AlterTable
ALTER TABLE "full_recon_remarks" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "gnr_recon_remarks" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "removal_receipts" ALTER COLUMN "invoice_number" SET DATA TYPE TEXT,
ALTER COLUMN "bin_location" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "shipped_to_fba" ADD COLUMN     "commission_usd" DECIMAL(12,4),
ADD COLUMN     "cost_updated_at" TIMESTAMP(3),
ADD COLUMN     "delivery_location" TEXT,
ADD COLUMN     "expert_charges_usd" DECIMAL(12,4),
ADD COLUMN     "final_net_price_usd" DECIMAL(12,4),
ADD COLUMN     "final_total_purchase_cost_usd" DECIMAL(12,4),
ADD COLUMN     "inventory_place_inbound_usd" DECIMAL(12,4),
ADD COLUMN     "other_charges_usd" DECIMAL(12,4),
ADD COLUMN     "per_book_cost_usd" DECIMAL(12,4),
ADD COLUMN     "publisher_name" TEXT,
ADD COLUMN     "purchase_id" TEXT,
ADD COLUMN     "supplier_name" TEXT,
ADD COLUMN     "supplier_shipping_usd" DECIMAL(12,4),
ADD COLUMN     "warehouse_prep_usd" DECIMAL(12,4);

-- CreateIndex
CREATE UNIQUE INDEX "shipped_to_fba_shipmentId_msku_fnsku_key" ON "shipped_to_fba"("shipmentId", "msku", "fnsku");

-- RenameIndex
ALTER INDEX "payment_repository_settlementId_orderId_sku_lineType_postedDate" RENAME TO "payment_repository_settlementId_orderId_sku_lineType_posted_key";

