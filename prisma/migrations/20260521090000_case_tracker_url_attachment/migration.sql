-- Add Amazon case URL + PDF attachment URL to case_tracker
ALTER TABLE "case_tracker" ADD COLUMN "caseUrl" TEXT;
ALTER TABLE "case_tracker" ADD COLUMN "attachmentUrl" TEXT;
