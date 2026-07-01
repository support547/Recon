import { createHash } from "node:crypto";

export const DEFAULT_MATCH_TOLERANCE_USD = 1.0;

/**
 * rowHash used for import dedupe. Same signed amount + same date +
 * same description text ⇒ same hash.
 * Kept here (not in the "use server" actions file) so both server and
 * non-server callers can share it.
 */
export function bankRowHash(
  txnDate: Date,
  description: string | null,
  amountUsd: number | string,
): string {
  const iso = txnDate.toISOString().slice(0, 10);
  const desc = (description ?? "").trim().replace(/\s+/g, " ");
  const amt =
    typeof amountUsd === "number"
      ? amountUsd.toFixed(4)
      : String(amountUsd ?? "0");
  return createHash("sha256").update(`${iso}${desc}${amt}`).digest("hex");
}
