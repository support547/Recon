-- Add receive modal fields to removal_receipts
ALTER TABLE "removal_receipts" ADD COLUMN "lpn_number" TEXT;
ALTER TABLE "removal_receipts" ADD COLUMN "bol_attachment_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "removal_receipts" ADD COLUMN "front_photo_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "removal_receipts" ADD COLUMN "back_photo_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "removal_receipts" ADD COLUMN "packing_list_count" INTEGER NOT NULL DEFAULT 0;
