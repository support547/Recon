// FBA reason code classification — Amazon FBA_Codes legend.
export const LOSS_CODES = ["M", "E", "5"] as const;
export const FOUND_CODES = ["F"] as const;
export const REVERSAL_CODES = ["N"] as const;
export const NOISE_CODES = [
  "P",
  "Q",
  "3",
  "4",
  "6",
  "7",
  "H",
  "K",
  "U",
  "D",
  "G",
  "O",
] as const;

export const CLAIM_DAYS_THRESHOLD = 60;

export const REASON_LABEL_MAP: Record<string, string> = {
  M: "Lost — Warehouse",
  "5": "Lost — Inbound",
  E: "Damaged — Warehouse",
  F: "Found — Inventory",
  N: "Reimbursement Reversal",
  P: "Process — Receive",
  Q: "Process — Receive",
  "3": "Process — Receive",
  "4": "Process — Sellable Return",
  "6": "Process — Damaged Return",
  "7": "Process — Customer Return",
  H: "Hold / QA",
  K: "Kit / Bundle",
  U: "Unit Status Change",
  D: "Damaged — Customer",
  G: "General Adjustment",
  O: "Other",
};

export const CLAIM_TAG_MAP: Record<string, string> = {
  M: "Lost_Warehouse",
  "5": "Lost_Warehouse",
  E: "Damaged_Warehouse",
  F: "Found",
  N: "Reimbursement_Reversal",
};

const LOSS_SET = new Set<string>(LOSS_CODES);
const FOUND_SET = new Set<string>(FOUND_CODES);
const REVERSAL_SET = new Set<string>(REVERSAL_CODES);
const NOISE_SET = new Set<string>(NOISE_CODES);

function norm(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

export function isLossCode(code: string | null | undefined): boolean {
  return LOSS_SET.has(norm(code));
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

export function getReasonLabel(code: string | null | undefined): string {
  const k = norm(code);
  return REASON_LABEL_MAP[k] ?? (k ? `Code ${k}` : "—");
}

export function getClaimTag(code: string | null | undefined): string {
  const k = norm(code);
  return CLAIM_TAG_MAP[k] ?? "";
}
