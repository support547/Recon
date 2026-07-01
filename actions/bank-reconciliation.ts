"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/actions/auth";
import {
  authzErrorToMutationResult,
  PermissionLevel,
  PermissionModule,
  requireLevel,
} from "@/lib/auth/rbac";
import { classifyBankDescription } from "@/lib/bank/classify";
import {
  bankRowHash,
  DEFAULT_MATCH_TOLERANCE_USD,
} from "@/lib/bank/constants";
import type {
  BankImportResult,
  BankReconciliationKpis,
  BankTransactionFilters,
  BankTransactionRow,
  MatchedSettlementDetail,
  MutationResult,
  ParsedBankRow,
  SettlementCandidate,
} from "@/lib/bank/types";
import { prisma } from "@/lib/prisma";
import {
  BankMatchInputSchema,
  BankTransactionUpsertSchema,
} from "@/lib/validations/bank-reconciliation";

const REVALIDATE_PATHS = ["/payment-reconciliation/bank-recon"];

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) {
    try {
      revalidatePath(p);
    } catch {
      // ignore
    }
  }
}

function serializeRow(
  r: Prisma.BankTransactionGetPayload<Record<string, never>>,
): BankTransactionRow {
  return {
    id: r.id,
    txnDate: r.txnDate,
    description: r.description,
    amountUsd: r.amountUsd.toString(),
    direction: r.direction,
    sourceCategory: r.sourceCategory,
    detectedStore: r.detectedStore,
    detectedCurrency: r.detectedCurrency,
    matchable: r.matchable,
    matchedSettlementId: r.matchedSettlementId,
    matchStatus: r.matchStatus,
    settlementExpected: r.settlementExpected
      ? r.settlementExpected.toString()
      : null,
    varianceUsd: r.varianceUsd ? r.varianceUsd.toString() : null,
    impliedFxRate: r.impliedFxRate ? r.impliedFxRate.toString() : null,
    bankReference: r.bankReference,
    notes: r.notes,
    importBatchId: r.importBatchId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}


/* ============================================================
 * LIST + CRUD
 * ============================================================ */

export async function getBankTransactions(
  filters: BankTransactionFilters = {},
): Promise<BankTransactionRow[]> {
  const where: Prisma.BankTransactionWhereInput = { deletedAt: null };

  if (filters.matchStatus) where.matchStatus = filters.matchStatus;
  if (filters.direction) where.direction = filters.direction;
  if (filters.sourceCategory) where.sourceCategory = filters.sourceCategory;
  if (filters.dateFrom || filters.dateTo) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) range.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      // Inclusive: bump to end of day so a picker showing "2026-07-01"
      // matches txnDate=2026-07-01T00:00:00Z.
      const to = new Date(filters.dateTo);
      to.setUTCHours(23, 59, 59, 999);
      range.lte = to;
    }
    where.txnDate = range;
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { description: { contains: q, mode: "insensitive" } },
      { bankReference: { contains: q, mode: "insensitive" } },
      { matchedSettlementId: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.bankTransaction.findMany({
    where,
    orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });
  return rows.map(serializeRow);
}

export async function getBankTransactionById(
  id: string,
): Promise<BankTransactionRow | null> {
  const row = await prisma.bankTransaction.findFirst({
    where: { id, deletedAt: null },
  });
  return row ? serializeRow(row) : null;
}

export async function upsertBankTransaction(
  raw: unknown,
): Promise<MutationResult<{ id: string; created: boolean }>> {
  try {
    await requireAuth();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unauthorized.",
    };
  }

  const parsed = BankTransactionUpsertSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Invalid transaction data." };
  }
  const v = parsed.data;
  const classified = classifyBankDescription(v.description, v.amountUsd);
  const direction: "CREDIT" | "DEBIT" = v.amountUsd >= 0 ? "CREDIT" : "DEBIT";

  const payload: Prisma.BankTransactionUncheckedCreateInput = {
    txnDate: v.txnDate,
    description: v.description,
    amountUsd: new Prisma.Decimal(v.amountUsd),
    direction,
    sourceCategory: classified.sourceCategory,
    detectedStore: classified.detectedStore,
    detectedCurrency: classified.detectedCurrency,
    matchable: classified.matchable,
    bankReference: v.bankReference,
    notes: v.notes,
    rowHash: bankRowHash(v.txnDate, v.description, v.amountUsd),
  };

  try {
    if (v.id) {
      const existing = await prisma.bankTransaction.findFirst({
        where: { id: v.id, deletedAt: null },
        select: { id: true, matchStatus: true },
      });
      if (!existing) {
        return { ok: false, error: "Transaction not found." };
      }
      await prisma.bankTransaction.update({
        where: { id: v.id },
        data: payload,
      });
      revalidateAll();
      return { ok: true, data: { id: v.id, created: false } };
    }
    const row = await prisma.bankTransaction.create({
      data: payload,
      select: { id: true },
    });
    revalidateAll();
    return { ok: true, data: { id: row.id, created: true } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save transaction.";
    return { ok: false, error: msg };
  }
}

export async function deleteBankTransaction(
  id: string,
): Promise<MutationResult> {
  try {
    await requireLevel(PermissionModule.RECONCILIATION, PermissionLevel.FULL);
  } catch (e) {
    return authzErrorToMutationResult(e);
  }
  try {
    const result = await prisma.bankTransaction.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      return { ok: false, error: "Transaction not found." };
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not delete transaction.";
    return { ok: false, error: msg };
  }
}

/* ============================================================
 * SETTLEMENT CANDIDATES + MATCH / UNMATCH
 * ============================================================ */


export async function getSettlementMatchCandidates(
  bankTxnId: string,
  toleranceUsd: number = DEFAULT_MATCH_TOLERANCE_USD,
): Promise<{
  ok: boolean;
  error?: string;
  bankTxn?: BankTransactionRow;
  candidates?: SettlementCandidate[];
  mode?: "USA_AMOUNT" | "CA_MANUAL";
}> {
  const bt = await prisma.bankTransaction.findFirst({
    where: { id: bankTxnId, deletedAt: null },
  });
  if (!bt) return { ok: false, error: "Bank transaction not found." };
  if (!bt.matchable || bt.direction !== "CREDIT") {
    return {
      ok: false,
      error:
        "This bank line is not matchable (only positive USA / CA Amazon payouts can match to a settlement).",
    };
  }

  const store = bt.detectedStore;
  const mode: "USA_AMOUNT" | "CA_MANUAL" =
    bt.sourceCategory === "USA_PAYOUT" ? "USA_AMOUNT" : "CA_MANUAL";

  // Per-settlement rollup: authoritative totalAmount = MAX(total_amount)
  // per settlementId (Amazon writes the transfer total on the header row).
  // Exclude settlements already linked to a live bank line.
  type SettlementRollup = {
    settlement_id: string;
    store: string | null;
    currency: string | null;
    total_amount: string | null;
    deposit_date: string | null;
    start_date: string | null;
    end_date: string | null;
  };
  const rows = await prisma.$queryRaw<SettlementRollup[]>`
    SELECT s.settlement_id,
           MAX(s.store)      AS store,
           MAX(s.currency)   AS currency,
           MAX(s.total_amount) AS total_amount,
           TO_CHAR(MAX(s.deposit_date), 'YYYY-MM-DD') AS deposit_date,
           TO_CHAR(MIN(s.settlement_start_date), 'YYYY-MM-DD') AS start_date,
           TO_CHAR(MIN(s.settlement_end_date),   'YYYY-MM-DD') AS end_date
    FROM settlement_report s
    WHERE s."deletedAt" IS NULL
      AND s.settlement_id IS NOT NULL
      AND TRIM(s.settlement_id) <> ''
      AND s.store = ${store}
      AND NOT EXISTS (
        SELECT 1
        FROM bank_transactions bt
        WHERE bt."deletedAt" IS NULL
          AND bt.matched_settlement_id = s.settlement_id
      )
    GROUP BY s.settlement_id
    ORDER BY MAX(s.deposit_date) DESC NULLS LAST, s.settlement_id DESC
    LIMIT 500
  `;

  const bankAmt = Number(bt.amountUsd);
  const candidates: SettlementCandidate[] = rows.map((r) => {
    // Postgres NUMERIC comes back as a Prisma Decimal via $queryRaw. Decimals
    // are NOT plain objects, so returning them from a server action to a
    // client component fails the Next.js serialization guard. Convert once.
    const totalStr = r.total_amount == null ? "0" : String(r.total_amount);
    const total = Number(totalStr);
    if (mode === "USA_AMOUNT") {
      const variance = total - bankAmt;
      return {
        settlementId: r.settlement_id,
        store: (r.store as "USA" | "CA" | null) ?? null,
        currency: r.currency,
        totalAmount: totalStr,
        depositDate: r.deposit_date,
        startDate: r.start_date,
        endDate: r.end_date,
        amountUsdEquivalent: total,
        varianceUsd: variance,
        withinTolerance: Math.abs(variance) <= toleranceUsd,
        suggested: false,
      };
    }
    // CA: no amount ranking, no variance.
    return {
      settlementId: r.settlement_id,
      store: (r.store as "USA" | "CA" | null) ?? null,
      currency: r.currency,
      totalAmount: totalStr,
      depositDate: r.deposit_date,
      startDate: r.start_date,
      endDate: r.end_date,
      amountUsdEquivalent: 0,
      varianceUsd: null,
      withinTolerance: false,
      suggested: false,
    };
  });

  if (mode === "USA_AMOUNT") {
    // Rank by absolute variance ascending; mark the ones within tolerance
    // as "suggested" (best-first). The client highlights suggested ones.
    candidates.sort((a, b) => {
      const av = Math.abs(a.varianceUsd ?? Number.POSITIVE_INFINITY);
      const bv = Math.abs(b.varianceUsd ?? Number.POSITIVE_INFINITY);
      return av - bv;
    });
    for (const c of candidates) {
      if (c.withinTolerance) c.suggested = true;
    }
  }

  return {
    ok: true,
    bankTxn: serializeRow(bt),
    candidates,
    mode,
  };
}

export async function matchBankTransaction(
  raw: unknown,
): Promise<MutationResult<BankTransactionRow>> {
  try {
    await requireLevel(PermissionModule.RECONCILIATION, PermissionLevel.EDIT);
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  const parsed = BankMatchInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Invalid match input." };
  }
  const { bankTxnId, settlementId } = parsed.data;
  const tolerance =
    parsed.data.toleranceUsd != null && Number.isFinite(parsed.data.toleranceUsd)
      ? Number(parsed.data.toleranceUsd)
      : DEFAULT_MATCH_TOLERANCE_USD;

  try {
    const bt = await prisma.bankTransaction.findFirst({
      where: { id: bankTxnId, deletedAt: null },
    });
    if (!bt) return { ok: false, error: "Bank transaction not found." };
    if (!bt.matchable || bt.direction !== "CREDIT") {
      return { ok: false, error: "This bank line is not matchable." };
    }
    if (bt.matchStatus !== "UNMATCHED") {
      return {
        ok: false,
        error: "Transaction is already matched — unmatch it first.",
      };
    }

    // Rollup settlement.
    type Roll = { total_amount: string | null; store: string | null; currency: string | null };
    const [srow] = await prisma.$queryRaw<Roll[]>`
      SELECT MAX(total_amount) AS total_amount,
             MAX(store)        AS store,
             MAX(currency)     AS currency
      FROM settlement_report
      WHERE "deletedAt" IS NULL
        AND settlement_id = ${settlementId}
    `;
    if (!srow || srow.total_amount == null) {
      return { ok: false, error: "Settlement not found or has no total." };
    }
    if (srow.store !== bt.detectedStore) {
      return {
        ok: false,
        error: `Store mismatch: bank line is ${bt.detectedStore}, settlement is ${srow.store ?? "unknown"}.`,
      };
    }

    // 1:1 guard (defense in depth around the partial unique index).
    const taken = await prisma.bankTransaction.findFirst({
      where: {
        deletedAt: null,
        matchedSettlementId: settlementId,
        NOT: { id: bankTxnId },
      },
      select: { id: true },
    });
    if (taken) {
      return {
        ok: false,
        error: "That settlement is already matched to another bank line.",
      };
    }

    const expected = new Prisma.Decimal(srow.total_amount);
    const bankAmt = new Prisma.Decimal(bt.amountUsd);

    let variance: Prisma.Decimal | null = null;
    let fx: Prisma.Decimal | null = null;
    let status: "MATCHED" | "DISCREPANCY" = "MATCHED";

    if (bt.detectedCurrency === "USD") {
      variance = expected.minus(bankAmt);
      const absVar = Math.abs(Number(variance));
      status = absVar <= tolerance ? "MATCHED" : "DISCREPANCY";
    } else if (bt.detectedCurrency === "CAD") {
      // impliedFxRate = USD received / CAD expected
      const expectedN = Number(expected);
      if (expectedN !== 0) {
        fx = new Prisma.Decimal(Number(bankAmt) / expectedN);
      }
      status = "MATCHED";
    }

    const updated = await prisma.bankTransaction.update({
      where: { id: bankTxnId },
      data: {
        matchedSettlementId: settlementId,
        settlementExpected: expected,
        varianceUsd: variance,
        impliedFxRate: fx,
        matchStatus: status,
      },
    });
    revalidateAll();
    return { ok: true, data: serializeRow(updated) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not match transaction.";
    // Surface the unique-index violation as a friendlier message.
    if (msg.includes("bank_transactions_matched_settlement_live_key")) {
      return {
        ok: false,
        error: "That settlement is already matched to another bank line.",
      };
    }
    return { ok: false, error: msg };
  }
}

export async function unmatchBankTransaction(
  bankTxnId: string,
): Promise<MutationResult<BankTransactionRow>> {
  try {
    await requireLevel(PermissionModule.RECONCILIATION, PermissionLevel.EDIT);
  } catch (e) {
    return authzErrorToMutationResult(e);
  }
  try {
    const bt = await prisma.bankTransaction.findFirst({
      where: { id: bankTxnId, deletedAt: null },
      select: { id: true },
    });
    if (!bt) return { ok: false, error: "Bank transaction not found." };
    const updated = await prisma.bankTransaction.update({
      where: { id: bankTxnId },
      data: {
        matchedSettlementId: null,
        settlementExpected: null,
        varianceUsd: null,
        impliedFxRate: null,
        matchStatus: "UNMATCHED",
      },
    });
    revalidateAll();
    return { ok: true, data: serializeRow(updated) };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not unmatch transaction.";
    return { ok: false, error: msg };
  }
}

/* ============================================================
 * SETTLEMENT DETAIL FOR A MATCHED BANK LINE
 * ============================================================ */


export async function getSettlementDetailForBankTxn(
  bankTxnId: string,
): Promise<{ ok: boolean; error?: string; data?: MatchedSettlementDetail }> {
  const bt = await prisma.bankTransaction.findFirst({
    where: { id: bankTxnId, deletedAt: null },
  });
  if (!bt) return { ok: false, error: "Bank transaction not found." };
  if (!bt.matchedSettlementId) {
    return { ok: false, error: "Bank line is not matched." };
  }

  type Head = {
    store: string | null;
    currency: string | null;
    total_amount: string | null;
    deposit_date: string | null;
    start_date: string | null;
    end_date: string | null;
  };
  const [head] = await prisma.$queryRaw<Head[]>`
    SELECT MAX(store)      AS store,
           MAX(currency)   AS currency,
           MAX(total_amount) AS total_amount,
           TO_CHAR(MAX(deposit_date), 'YYYY-MM-DD') AS deposit_date,
           TO_CHAR(MIN(settlement_start_date), 'YYYY-MM-DD') AS start_date,
           TO_CHAR(MIN(settlement_end_date),   'YYYY-MM-DD') AS end_date
    FROM settlement_report
    WHERE "deletedAt" IS NULL
      AND settlement_id = ${bt.matchedSettlementId}
  `;
  if (!head) return { ok: false, error: "Settlement not found." };

  type Break = {
    transaction_type: string | null;
    amount_type: string | null;
    amount_description: string | null;
    sum: string | null;
    rows: bigint | number;
  };
  const breakdown = await prisma.$queryRaw<Break[]>`
    SELECT transaction_type,
           amount_type,
           amount_description,
           COALESCE(SUM(amount), 0) AS sum,
           COUNT(*) AS rows
    FROM settlement_report
    WHERE "deletedAt" IS NULL
      AND settlement_id = ${bt.matchedSettlementId}
    GROUP BY transaction_type, amount_type, amount_description
    ORDER BY transaction_type NULLS LAST,
             amount_type NULLS LAST,
             amount_description NULLS LAST
  `;

  return {
    ok: true,
    data: {
      settlementId: bt.matchedSettlementId,
      store: head.store,
      currency: head.currency,
      // NUMERIC → Prisma Decimal via $queryRaw; stringify before crossing
      // the server-action boundary to avoid Next.js serialization error.
      totalAmount: head.total_amount == null ? "0" : String(head.total_amount),
      depositDate: head.deposit_date,
      startDate: head.start_date,
      endDate: head.end_date,
      varianceUsd: bt.varianceUsd ? bt.varianceUsd.toString() : null,
      impliedFxRate: bt.impliedFxRate ? bt.impliedFxRate.toString() : null,
      amountUsdBankReceived: bt.amountUsd.toString(),
      matchStatus: bt.matchStatus,
      lineCount: breakdown.reduce((n, b) => n + Number(b.rows), 0),
      lineBreakdown: breakdown.map((b) => ({
        transactionType: b.transaction_type,
        amountType: b.amount_type,
        amountDescription: b.amount_description,
        sum: b.sum == null ? "0" : String(b.sum),
        rows: Number(b.rows),
      })),
    },
  };
}

/* ============================================================
 * KPIs
 * ============================================================ */


export async function getBankReconciliationKpis(): Promise<BankReconciliationKpis> {
  type Row = {
    unmatched_count: bigint | number;
    unmatched_sum: string | null;
    matched_count: bigint | number;
    matched_sum: string | null;
    disc_count: bigint | number;
    disc_sum: string | null;
    ca_count: bigint | number;
    ca_sum: string | null;
    non_match_count: bigint | number;
    non_match_sum: string | null;
  };
  const [row] = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*) FILTER (WHERE matchable = TRUE AND match_status = 'UNMATCHED'
                          AND direction = 'CREDIT')                       AS unmatched_count,
      COALESCE(SUM(amount_usd) FILTER (WHERE matchable = TRUE
                                          AND match_status = 'UNMATCHED'
                                          AND direction = 'CREDIT'), 0)   AS unmatched_sum,
      COUNT(*) FILTER (WHERE match_status = 'MATCHED')                    AS matched_count,
      COALESCE(SUM(amount_usd) FILTER (WHERE match_status = 'MATCHED'), 0) AS matched_sum,
      COUNT(*) FILTER (WHERE match_status = 'DISCREPANCY')                AS disc_count,
      COALESCE(SUM(ABS(variance_usd)) FILTER (WHERE match_status = 'DISCREPANCY'), 0) AS disc_sum,
      COUNT(*) FILTER (WHERE source_category = 'CA_PAYOUT'
                          AND match_status = 'MATCHED')                   AS ca_count,
      COALESCE(SUM(amount_usd) FILTER (WHERE source_category = 'CA_PAYOUT'
                                          AND match_status = 'MATCHED'), 0) AS ca_sum,
      COUNT(*) FILTER (WHERE direction = 'CREDIT'
                          AND matchable = FALSE)                          AS non_match_count,
      COALESCE(SUM(amount_usd) FILTER (WHERE direction = 'CREDIT'
                                          AND matchable = FALSE), 0)     AS non_match_sum
    FROM bank_transactions
    WHERE "deletedAt" IS NULL
  `;

  const num = (v: bigint | number | null | undefined) =>
    v == null ? 0 : Number(v);
  const str = (v: string | null | undefined) => (v == null ? "0" : String(v));

  return {
    unmatchedPayouts: {
      count: num(row.unmatched_count),
      sumUsd: str(row.unmatched_sum),
    },
    matched: { count: num(row.matched_count), sumUsd: str(row.matched_sum) },
    discrepancies: {
      count: num(row.disc_count),
      sumAbsVarianceUsd: str(row.disc_sum),
    },
    caSummary: {
      count: num(row.ca_count),
      sumUsdReceived: str(row.ca_sum),
      blendedFxNote:
        "CAD expected shown per row. Blended FX rate depends on individual settlement mix — see per-row rate.",
    },
    nonMatchableCredits: {
      count: num(row.non_match_count),
      sumUsd: str(row.non_match_sum),
    },
  };
}

/* ============================================================
 * CSV / XLSX IMPORT
 * Consumed by the /api/bank-reconciliation/import route.
 * Kept here so the classification and dedupe logic lives with the
 * rest of the bank actions.
 * ============================================================ */



/** Persist a batch of already-parsed bank rows. Applies classification,
 *  dedupes on rowHash, stamps a shared importBatchId. */
export async function persistBankImportBatch(
  parsedRows: ParsedBankRow[],
  importBatchId: string,
): Promise<BankImportResult> {
  const counts = {
    usaPayout: 0,
    caPayout: 0,
    mxPayout: 0,
    other: 0,
    credits: 0,
    debits: 0,
  };

  // Compute a rowHash per row up-front so we can dedupe within the file
  // AND against DB rows in a single batched query.
  type Prepared = ParsedBankRow & {
    rowHash: string;
    direction: "CREDIT" | "DEBIT";
    sourceCategory: "USA_PAYOUT" | "CA_PAYOUT" | "MX_PAYOUT" | "OTHER";
    detectedStore: string | null;
    detectedCurrency: string | null;
    matchable: boolean;
  };
  const prepared: Prepared[] = parsedRows.map((r) => {
    const cls = classifyBankDescription(r.description, r.amountUsd);
    return {
      ...r,
      direction: r.amountUsd >= 0 ? "CREDIT" : "DEBIT",
      sourceCategory: cls.sourceCategory,
      detectedStore: cls.detectedStore,
      detectedCurrency: cls.detectedCurrency,
      matchable: cls.matchable,
      rowHash: bankRowHash(r.txnDate, r.description, r.amountUsd),
    };
  });

  // Dedupe within the file (keep first occurrence).
  const seenInFile = new Set<string>();
  const unique: Prepared[] = [];
  for (const p of prepared) {
    if (seenInFile.has(p.rowHash)) continue;
    seenInFile.add(p.rowHash);
    unique.push(p);
  }

  // Dedupe against existing DB rows (batched IN-clause to stay under
  // Postgres bind-param limits).
  const existing = new Set<string>();
  const CHUNK = 1000;
  const hashes = unique.map((u) => u.rowHash);
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const chunk = hashes.slice(i, i + CHUNK);
    const rows = await prisma.bankTransaction.findMany({
      where: { rowHash: { in: chunk } },
      select: { rowHash: true },
    });
    for (const r of rows) if (r.rowHash) existing.add(r.rowHash);
  }

  const toInsert = unique.filter((u) => !existing.has(u.rowHash));

  for (const p of prepared) {
    if (p.direction === "CREDIT") counts.credits += 1;
    else counts.debits += 1;
    switch (p.sourceCategory) {
      case "USA_PAYOUT":
        counts.usaPayout += 1;
        break;
      case "CA_PAYOUT":
        counts.caPayout += 1;
        break;
      case "MX_PAYOUT":
        counts.mxPayout += 1;
        break;
      default:
        counts.other += 1;
    }
  }

  if (toInsert.length === 0) {
    return {
      ok: true,
      rowsInserted: 0,
      rowsSkipped: parsedRows.length,
      totalInFile: parsedRows.length,
      importBatchId,
      counts,
    };
  }

  await prisma.bankTransaction.createMany({
    data: toInsert.map((p) => ({
      txnDate: p.txnDate,
      description: p.description,
      amountUsd: new Prisma.Decimal(p.amountUsd),
      direction: p.direction,
      sourceCategory: p.sourceCategory,
      detectedStore: p.detectedStore,
      detectedCurrency: p.detectedCurrency,
      matchable: p.matchable,
      importBatchId,
      rowHash: p.rowHash,
    })),
  });

  revalidateAll();
  return {
    ok: true,
    rowsInserted: toInsert.length,
    rowsSkipped: parsedRows.length - toInsert.length,
    totalInFile: parsedRows.length,
    importBatchId,
    counts,
  };
}
