-- DropIndex
DROP INDEX "inbound_shipments_store_idx";

-- AlterTable
ALTER TABLE "inbound_shipments" DROP COLUMN "notes",
DROP COLUMN "store";
