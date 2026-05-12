-- AlterTable
ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false;
