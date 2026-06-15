-- Add the LOST adjustment type (unit confirmed lost in FBA).
ALTER TYPE "AdjType" ADD VALUE IF NOT EXISTS 'LOST';
