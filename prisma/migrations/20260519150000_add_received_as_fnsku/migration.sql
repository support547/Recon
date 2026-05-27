-- Add receivedAsFnsku to manual_adjustments for "Wrong Label" tracking.
ALTER TABLE "manual_adjustments" ADD COLUMN IF NOT EXISTS "received_as_fnsku" TEXT;
