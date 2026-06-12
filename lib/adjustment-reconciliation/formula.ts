// FBA reason code classification — Amazon FBA_Codes legend.
//
// The ledger UI only displays DEBIT events (negative qty). Credits (F, N, P, 3)
// are loaded into matching pools and consumed by the engine, but never rendered.
//
// Debit groups:
//   LOSS_TRACKED      — M, E. Amazon tracks via Reconciled/Unreconciled.
//   LOSS_MANUAL       — D, G, O. Amazon does not track; we cover via case/manual.
//   TRANSFER_OUT      — 4. Grade & Resell counterpart 3 lands on amzn.gr.* MSKU.
//   DISPO_REMOVE      — Q. Paired with P (normal) or treated as E
//                          (WAREHOUSE_DAMAGED disposition).
//
// Credit groups (matching only, never displayed):
//   F (Found), N (Reimbursement Reversal), P (Dispo +), 3 (Transfer In)
export const LOSS_TRACKED = ["M", "E"] as const;
export const LOSS_MANUAL = ["D", "G", "O"] as const;
export const TRANSFER_OUT = ["4"] as const;
export const DISPO_REMOVE = ["Q"] as const;

// Display set: codes that appear in the ledger table.
export const LEDGER_DISPLAY_CODES = [
  ...LOSS_TRACKED,
  ...LOSS_MANUAL,
  ...TRANSFER_OUT,
  ...DISPO_REMOVE,
] as const;

// Credit (matching pool) codes — never displayed.
export const CREDIT_CODES = ["F", "N", "P", "3"] as const;

// Legacy aliases kept so other files still compile.
export const LOSS_AMAZON_TRACKED = LOSS_TRACKED;
export const LOSS_SELF_TRACKED = LOSS_MANUAL;
export const LOSS_CODES = [...LOSS_TRACKED, ...LOSS_MANUAL, "5"] as const;
export const FOUND_CODES = ["F"] as const;
export const REVERSAL_CODES = ["N"] as const;
export const TRANSFER_OUT_CODE = "4" as const;
export const TRANSFER_IN_CODE = "3" as const;
export const DISPO_CHANGE_PLUS = "P" as const;
export const DISPO_CHANGE_MINUS = "Q" as const;

// Codes the engine ignores entirely.
export const NOISE_CODES = ["5", "6", "7", "H", "K", "U"] as const;

export const CLAIM_DAYS_THRESHOLD = 60;

export const REASON_LABEL_MAP: Record<string, string> = {
  M: "Lost — Warehouse",
  "5": "Lost — Inbound",
  E: "Damaged — Warehouse",
  F: "Found — Inventory",
  N: "Reimbursement Reversal",
  P: "Disposition Change (+)",
  Q: "Disposition Removed",
  "3": "Grade & Resell — In",
  "4": "Grade & Resell — Out",
  "6": "Process — Damaged Return",
  "7": "Process — Customer Return",
  H: "Hold / QA",
  K: "Kit / Bundle",
  U: "Unit Status Change",
  D: "Defective / Disposed",
  G: "Donation",
  O: "Ownership Correction",
};

export const CLAIM_TAG_MAP: Record<string, string> = {
  M: "Lost_Warehouse",
  "5": "Lost_Inbound",
  E: "Damaged_Warehouse",
  F: "Found",
  N: "Reimbursement_Reversal",
};

// Amazon reimbursement automation windows.
export const AUTO_REIMB_GRACE_DAYS = 7;
export const DAMAGED_AUTO_REIMB_GRACE_DAYS = 7;
export const LOST_RESEARCH_WINDOW_DAYS = 30;
export const CLAIM_EXPIRY_DAYS = 60;

// Coverage type stamped on each ledger row.
export type AdjCoverageType =
  | "reimbursed"
  | "found"
  | "grade-resell"
  | "disposition-change"
  | "case"
  | "manual-adj"
  | "partial"
  | "open";

// Per-event decision the engine emits — legacy name retained for back-compat.
export type AdjDecision =
  | "pending"
  | "reimbursed"
  | "partially-reimbursed"
  | "found"
  | "grade-resell"
  | "disposition-change"
  | "reversal"
  | "manual-adjustment"
  | "case-covered"
  | "removal";

// Workflow status the operator sees. Aggregated to MSKU as worst-of.
export type AdjStatus =
  | "reconciled"
  | "waiting"
  | "take-action"
  | "grade-resell";

export type ReimbBucket = "lost" | "damaged" | "other";

export function reimbReasonBucket(reason: string | null | undefined): ReimbBucket {
  const r = (reason ?? "").trim().toLowerCase().replace(/[ _-]/g, "");
  if (r === "lostwarehouse") return "lost";
  if (r === "damagedwarehouse") return "damaged";
  return "other";
}

const LOSS_TRACKED_SET = new Set<string>(LOSS_TRACKED);
const LOSS_MANUAL_SET = new Set<string>(LOSS_MANUAL);
const LOSS_SET = new Set<string>(LOSS_CODES);
const FOUND_SET = new Set<string>(FOUND_CODES);
const REVERSAL_SET = new Set<string>(REVERSAL_CODES);
const NOISE_SET = new Set<string>(NOISE_CODES);
const DISPLAY_SET = new Set<string>(LEDGER_DISPLAY_CODES);

function norm(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

export function isLedgerDisplayCode(code: string | null | undefined): boolean {
  return DISPLAY_SET.has(norm(code));
}

export function isLossCode(code: string | null | undefined): boolean {
  return LOSS_SET.has(norm(code));
}

export function isAmazonTrackedLossCode(code: string | null | undefined): boolean {
  return LOSS_TRACKED_SET.has(norm(code));
}

export function isSelfTrackedLossCode(code: string | null | undefined): boolean {
  return LOSS_MANUAL_SET.has(norm(code));
}

export function isFoundCode(code: string | null | undefined): boolean {
  return FOUND_SET.has(norm(code));
}

export function isReversalCode(code: string | null | undefined): boolean {
  return REVERSAL_SET.has(norm(code));
}

export function isNoiseCode(code: string | null | undefined): boolean {
  return NOISE_SET.has(norm(code));
}

export function isTransferOutCode(code: string | null | undefined): boolean {
  return norm(code) === TRANSFER_OUT_CODE;
}

export function isTransferInCode(code: string | null | undefined): boolean {
  return norm(code) === TRANSFER_IN_CODE;
}

export function isDispoChangeCode(code: string | null | undefined): boolean {
  const k = norm(code);
  return k === DISPO_CHANGE_PLUS || k === DISPO_CHANGE_MINUS;
}

// Q rows with WAREHOUSE_DAMAGED disposition are damage events disguised as
// disposition removals — match against the damaged reimb bucket.
export function isQAsLoss(
  code: string | null | undefined,
  disposition: string | null | undefined,
): boolean {
  return norm(code) === "Q" && (disposition ?? "").trim().toUpperCase() === "WAREHOUSE_DAMAGED";
}

export function getReasonLabel(code: string | null | undefined): string {
  const k = norm(code);
  return REASON_LABEL_MAP[k] ?? (k ? `Code ${k}` : "—");
}

export function getClaimTag(code: string | null | undefined): string {
  const k = norm(code);
  return CLAIM_TAG_MAP[k] ?? "";
}

// Human-readable decision string per code + coverage + age.
export function decisionString(args: {
  code: string;
  disposition: string;
  coverageType: AdjCoverageType;
  ageDays: number; // days since adjDate
}): string {
  const code = norm(args.code);
  const cov = args.coverageType;
  if (code === "M") {
    if (cov === "found") return "Found by fulfillment center";
    if (cov === "reimbursed") return "Reimbursed — Lost_Warehouse";
    if (cov === "partial") return "Partially reimbursed — Lost_Warehouse";
    if (cov === "open") {
      return args.ageDays <= AUTO_REIMB_GRACE_DAYS
        ? "Pending — auto-reimbursement in flight"
        : "Lost — reimbursement missing, raise case";
    }
  }
  if (code === "E") {
    if (cov === "reimbursed") return "Reimbursed — Damaged_Warehouse";
    if (cov === "partial") return "Partially reimbursed — Damaged_Warehouse";
    if (cov === "open") {
      return args.ageDays <= AUTO_REIMB_GRACE_DAYS
        ? "Pending — auto-reimbursement in flight"
        : "Damaged — reimbursement missing, raise case";
    }
  }
  if (code === "D") {
    if (cov === "case") return "Covered by case";
    if (cov === "manual-adj") return "Covered by manual adjustment";
    if (cov === "partial") return "Partially covered — D";
    return "D: Disposed — raise case";
  }
  if (code === "G") {
    if (cov === "case") return "Covered by case";
    if (cov === "manual-adj") return "Covered by manual adjustment";
    if (cov === "partial") return "Partially covered — G";
    return "G: Donated — raise case";
  }
  if (code === "O") {
    if (cov === "case") return "Covered by case";
    if (cov === "manual-adj") return "Covered by manual adjustment";
    if (cov === "partial") return "Partially covered — O";
    return "O: Ownership correction — raise case";
  }
  if (code === "4") {
    if (cov === "grade-resell") return "Grade & Resell transfer — paired";
    return "Grade & Resell transfer — counterpart missing";
  }
  if (code === "Q") {
    if (isQAsLoss(code, args.disposition)) {
      if (cov === "reimbursed") return "Reimbursed — Warehouse damaged during regrading";
      if (cov === "partial") return "Partially reimbursed — Warehouse damaged";
      return "Warehouse damaged during regrading — check reimbursement";
    }
    if (cov === "disposition-change") return "Disposition change — paired with P";
    return "Disposition removed — no matching P found";
  }
  return cov === "open" ? "Open" : "Covered";
}
