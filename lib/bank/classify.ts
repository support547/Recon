/**
 * Bank statement description classifier.
 *
 * Real bank descriptions (verified across ~230 rows) fall into four
 * mutually-exclusive categories. Only positive USA_PAYOUT / CA_PAYOUT
 * credits are matchable to a SettlementReport:
 *
 *   A. USA_PAYOUT — "DES:PAYMENTS" + "CO ID:3215240102" + trailing "CCD".
 *   B. CA_PAYOUT  — CA-marketplace international ACH ("IAT") payment,
 *                   detected via a CA text marker (".COM.CA" / "AMAZONCOMCA"
 *                   / "AMAZON.COM.CA") AND a CA/international payer CO ID
 *                   (9978170001 or 2110000247).
 *   C. MX_PAYOUT  — "Amazon Mexico" (detected but non-matchable).
 *   D. OTHER      — everything else (card purchases, fees, non-Amazon
 *                   credits, and every debit regardless of description).
 *
 * A row is `matchable` iff direction=CREDIT AND category in (A, B).
 */

export type BankSourceCategory =
  | "USA_PAYOUT"
  | "CA_PAYOUT"
  | "MX_PAYOUT"
  | "OTHER";

export type ClassifyResult = {
  sourceCategory: BankSourceCategory;
  detectedStore: "USA" | "CA" | "MX" | null;
  detectedCurrency: "USD" | "CAD" | null;
  matchable: boolean;
};

const USA_CO_ID = "3215240102";
const CA_CO_IDS = ["9978170001", "2110000247"];
const CA_TEXT_MARKERS = [".com.ca", "amazoncomca", "amazon.com.ca"];
const MX_MARKER = "amazon mexico";

/**
 * Classify a bank statement line. `description` is the raw text as it
 * appears in the CSV; `amountUsd` is the signed amount (positive for
 * credits, negative for debits).
 */
export function classifyBankDescription(
  description: string | null | undefined,
  amountUsd: number,
): ClassifyResult {
  const raw = (description ?? "").trim();
  const text = raw.toLowerCase();
  const isCredit = Number.isFinite(amountUsd) && amountUsd > 0;

  // Debits are never matchable regardless of what the description says.
  if (!isCredit) {
    return {
      sourceCategory: "OTHER",
      detectedStore: null,
      detectedCurrency: null,
      matchable: false,
    };
  }

  // Category C — Amazon Mexico. Check BEFORE anything else so an
  // "Amazon Mexico ... CO ID:2110000247" line doesn't fall into the CA
  // branch (2110000247 is shared between CA and MX in the real data).
  if (text.includes(MX_MARKER)) {
    return {
      sourceCategory: "MX_PAYOUT",
      detectedStore: "MX",
      detectedCurrency: null,
      matchable: false,
    };
  }

  const hasIat = /\biat\b/.test(text);
  const hasCaMarker = CA_TEXT_MARKERS.some((m) => text.includes(m));
  const hasCaCoId = CA_CO_IDS.some((id) => text.includes(id));

  // Category B — CA_PAYOUT. Dual-signal: CA text marker + CA payer CO ID
  // (2110000247 without CA marker is Mexico, handled above). We also
  // gate on IAT because every real CA-marketplace payment in the data
  // is an International ACH.
  if (hasCaMarker && hasCaCoId && hasIat) {
    return {
      sourceCategory: "CA_PAYOUT",
      detectedStore: "CA",
      detectedCurrency: "CAD",
      matchable: true,
    };
  }

  // Category A — USA_PAYOUT. USA seller payout ACH. Must have BOTH
  // signals: DES:PAYMENTS (note the trailing S) and USA CO ID. The
  // trailing "CCD" is a helpful confirmation but not required — some
  // formatting variations drop it, and requiring it would mis-classify
  // otherwise-clean USA payouts as OTHER.
  const hasDesPayments = text.includes("des:payments");
  const hasUsaCoId = text.includes(USA_CO_ID);
  if (hasDesPayments && hasUsaCoId && !hasIat) {
    return {
      sourceCategory: "USA_PAYOUT",
      detectedStore: "USA",
      detectedCurrency: "USD",
      matchable: true,
    };
  }

  // Everything else — Amazon card purchases, fees, non-Amazon credits,
  // and ambiguous rows we won't guess about. Non-matchable.
  return {
    sourceCategory: "OTHER",
    detectedStore: null,
    detectedCurrency: null,
    matchable: false,
  };
}

/**
 * Small self-check bundle — the real-data examples from the spec. Not
 * a formal test framework, but callable from ad-hoc scripts and used by
 * the import route to sanity-guard the classifier at boot.
 */
export const CLASSIFIER_SELF_CHECK: Array<{
  desc: string;
  amount: number;
  expect: BankSourceCategory;
  expectMatchable: boolean;
}> = [
  {
    desc:
      "AMAZON.C27ALAHKI DES:PAYMENTS ID:1PAO41JRXJNU4J9 INDN:Daily Books CO ID:3215240102 CCD",
    amount: 12345.67,
    expect: "USA_PAYOUT",
    expectMatchable: true,
  },
  {
    desc:
      "AMAZON.COM.CA UL DES:PAYMENT ID:KP2PUSD60JTO INDN:Daily Books CO ID:9978170001 IAT",
    amount: 730.0,
    expect: "CA_PAYOUT",
    expectMatchable: true,
  },
  {
    desc:
      "AMAZONCOMCA INC DES:PAYMENT ID:KO47USBXRCNO INDN:Daily Books CO ID:9978170001 IAT",
    amount: 512.0,
    expect: "CA_PAYOUT",
    expectMatchable: true,
  },
  {
    desc:
      "Amazon.com.ca In DES:INTL PYMNT ID:1073A8G000JKGD INDN:Daily Books CO ID:2110000247 IAT",
    amount: 640.0,
    expect: "CA_PAYOUT",
    expectMatchable: true,
  },
  {
    desc:
      "Amazon Mexico Se DES:INTL PYMNT ID:9999 INDN:Daily Books CO ID:2110000247 IAT",
    amount: 88.0,
    expect: "MX_PAYOUT",
    expectMatchable: false,
  },
  {
    desc: "AMZN Mktp CA*UY97 06/10 PURCHASE 0000000000 ON DEBIT CARD",
    amount: 45.0,
    expect: "OTHER",
    expectMatchable: false,
  },
  {
    desc: "INTERNATIONAL TRANSACTION FEE",
    amount: 1.25,
    expect: "OTHER",
    expectMatchable: false,
  },
  {
    // Same USA payout description but negative amount → debit → not matchable.
    desc:
      "AMAZON.C27ALAHKI DES:PAYMENTS ID:1PAO41JRXJNU4J9 INDN:Daily Books CO ID:3215240102 CCD",
    amount: -100.0,
    expect: "OTHER",
    expectMatchable: false,
  },
];

/** Returns { ok, failures[] } — used by /api routes to assert boot-time correctness. */
export function runClassifierSelfCheck(): {
  ok: boolean;
  failures: Array<{
    desc: string;
    amount: number;
    expected: BankSourceCategory;
    got: BankSourceCategory;
    expectedMatchable: boolean;
    gotMatchable: boolean;
  }>;
} {
  const failures: ReturnType<typeof runClassifierSelfCheck>["failures"] = [];
  for (const t of CLASSIFIER_SELF_CHECK) {
    const r = classifyBankDescription(t.desc, t.amount);
    if (r.sourceCategory !== t.expect || r.matchable !== t.expectMatchable) {
      failures.push({
        desc: t.desc,
        amount: t.amount,
        expected: t.expect,
        got: r.sourceCategory,
        expectedMatchable: t.expectMatchable,
        gotMatchable: r.matchable,
      });
    }
  }
  return { ok: failures.length === 0, failures };
}
