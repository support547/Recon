"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getSettlementMatchCandidates,
  matchBankTransaction,
} from "@/actions/bank-reconciliation";
import { DEFAULT_MATCH_TOLERANCE_USD } from "@/lib/bank/constants";
import type {
  BankTransactionRow,
  SettlementCandidate,
} from "@/lib/bank/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankTxn: BankTransactionRow | null;
  onMatched: () => void;
};

function fmtUsd(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtCad(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return `C$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function BankReconMatchModal({
  open,
  onOpenChange,
  bankTxn,
  onMatched,
}: Props) {
  const [tolerance, setTolerance] = React.useState<string>(
    String(DEFAULT_MATCH_TOLERANCE_USD),
  );
  const [loading, setLoading] = React.useState(false);
  const [candidates, setCandidates] = React.useState<SettlementCandidate[]>([]);
  const [mode, setMode] = React.useState<"USA_AMOUNT" | "CA_MANUAL" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [typedIdError, setTypedIdError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!bankTxn) return;
    setLoading(true);
    setError(null);
    const tol = Number.parseFloat(tolerance);
    const res = await getSettlementMatchCandidates(
      bankTxn.id,
      Number.isFinite(tol) ? tol : DEFAULT_MATCH_TOLERANCE_USD,
    );
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Could not load candidates.");
      setCandidates([]);
      setMode(null);
      return;
    }
    setCandidates(res.candidates ?? []);
    setMode(res.mode ?? null);
  }, [bankTxn, tolerance]);

  React.useEffect(() => {
    if (!open) return;
    setSearch("");
    setTypedIdError(null);
    setTolerance(String(DEFAULT_MATCH_TOLERANCE_USD));
    refresh();
    // Only re-run when the modal opens or the txn changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bankTxn?.id]);

  React.useEffect(() => {
    // Any keystroke clears the previous typed-ID validation error.
    setTypedIdError(null);
  }, [search]);

  React.useEffect(() => {
    // Recompute suggested-within-tolerance whenever tolerance changes.
    if (!open || !bankTxn) return;
    const handle = setTimeout(refresh, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tolerance]);

  async function submitMatch(settlementId: string) {
    if (!bankTxn) return;
    setSubmitting(settlementId);
    const tol = Number.parseFloat(tolerance);
    const res = await matchBankTransaction({
      bankTxnId: bankTxn.id,
      settlementId,
      toleranceUsd: Number.isFinite(tol) ? tol : DEFAULT_MATCH_TOLERANCE_USD,
    });
    setSubmitting(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const status = res.data?.matchStatus ?? "MATCHED";
    toast.success(
      status === "DISCREPANCY"
        ? "Linked with discrepancy (over tolerance)."
        : "Match saved.",
    );
    onOpenChange(false);
    onMatched();
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.settlementId.toLowerCase().includes(q) ||
        (c.depositDate ?? "").toLowerCase().includes(q) ||
        (c.startDate ?? "").toLowerCase().includes(q),
    );
  }, [candidates, search]);

  const typedTrim = search.trim();
  // Exact case-insensitive match against the candidate set (which is already
  // store-scoped and excludes already-matched settlements by the server). If
  // the typed ID isn't in the candidates it means one of: not a real settlement,
  // wrong store, or already used — we refuse the submit and show why.
  const typedExactMatch: SettlementCandidate | null = React.useMemo(() => {
    if (!typedTrim) return null;
    const t = typedTrim.toLowerCase();
    return (
      candidates.find((c) => c.settlementId.toLowerCase() === t) ?? null
    );
  }, [candidates, typedTrim]);

  async function handleMatchTypedId() {
    if (!typedTrim) {
      setTypedIdError("Enter a settlement ID.");
      return;
    }
    if (!typedExactMatch) {
      setTypedIdError(
        "Not a valid candidate. The settlement is either unknown, from a different store, or already matched to another bank line.",
      );
      return;
    }
    setTypedIdError(null);
    await submitMatch(typedExactMatch.settlementId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(92vh,760px)] w-full flex-col gap-0 overflow-hidden sm:max-w-3xl"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>Select settlement</DialogTitle>
          <DialogDescription>
            {bankTxn ? (
              <>
                {new Date(bankTxn.txnDate).toISOString().slice(0, 10)} ·{" "}
                <span className="font-mono text-xs">
                  {fmtUsd(bankTxn.amountUsd)}
                </span>{" "}
                · {bankTxn.sourceCategory.replace("_", " ")} ·{" "}
                {bankTxn.detectedStore ?? "—"} / {bankTxn.detectedCurrency ?? "—"}
              </>
            ) : (
              "Loading…"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 py-2">
          <div className="flex flex-wrap items-end gap-3 px-1">
            {mode === "USA_AMOUNT" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="tolerance">Tolerance (USD)</Label>
                <Input
                  id="tolerance"
                  inputMode="decimal"
                  value={tolerance}
                  onChange={(e) => setTolerance(e.target.value)}
                  className="w-32"
                />
              </div>
            ) : null}
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="cand-search">
                Search or type settlement ID
              </Label>
              <div className="flex gap-2">
                <Input
                  id="cand-search"
                  placeholder="Filter the list or paste a settlement ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleMatchTypedId();
                    }
                  }}
                  aria-invalid={typedIdError ? true : undefined}
                  aria-describedby={typedIdError ? "typed-id-error" : undefined}
                />
                <Button
                  type="button"
                  variant={typedExactMatch ? "default" : "outline"}
                  disabled={
                    !typedTrim || submitting !== null || loading
                  }
                  onClick={handleMatchTypedId}
                  title="Match the settlement whose ID you typed"
                >
                  {submitting && typedExactMatch &&
                  submitting === typedExactMatch.settlementId
                    ? "Matching…"
                    : "Match this ID"}
                </Button>
              </div>
              {typedIdError ? (
                <p
                  id="typed-id-error"
                  className="text-xs text-red-700"
                  role="alert"
                >
                  {typedIdError}
                </p>
              ) : typedTrim && typedExactMatch ? (
                <p className="text-xs text-emerald-700">
                  Valid candidate: {typedExactMatch.settlementId}. Press
                  Enter or click “Match this ID” to link.
                </p>
              ) : null}
            </div>
          </div>

          {mode === "CA_MANUAL" ? (
            <p className="mx-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              CAD deposit — pick the correct CA settlement manually. Implied FX
              rate is computed after linking. No amount ranking, no discrepancy.
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">
                Loading candidates…
              </div>
            ) : error ? (
              <div className="p-4 text-sm text-red-700">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No unmatched settlements available for this store.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-[11px] uppercase tracking-wider text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Settlement</th>
                    <th className="px-3 py-2 text-left">Deposit</th>
                    <th className="px-3 py-2 text-left">Period</th>
                    <th className="px-3 py-2 text-right">
                      Expected ({mode === "CA_MANUAL" ? "CAD" : "USD"})
                    </th>
                    {mode === "USA_AMOUNT" ? (
                      <th className="px-3 py-2 text-right">Variance USD</th>
                    ) : null}
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const highlight = c.suggested;
                    return (
                      <tr
                        key={c.settlementId}
                        className={cn(
                          "border-t border-slate-100",
                          highlight ? "bg-emerald-50/60" : "",
                        )}
                      >
                        <td className="px-3 py-2 font-mono text-xs">
                          {c.settlementId}
                          {highlight ? (
                            <Badge className="ml-2 bg-emerald-600 text-white">
                              Suggested
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.depositDate ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.startDate && c.endDate
                            ? `${c.startDate} → ${c.endDate}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {mode === "CA_MANUAL"
                            ? fmtCad(c.totalAmount)
                            : fmtUsd(c.totalAmount)}
                        </td>
                        {mode === "USA_AMOUNT" ? (
                          <td
                            className={cn(
                              "px-3 py-2 text-right font-mono tabular-nums",
                              c.withinTolerance
                                ? "text-emerald-700"
                                : "text-red-700",
                            )}
                          >
                            {c.varianceUsd == null
                              ? "—"
                              : fmtUsd(c.varianceUsd)}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant={highlight ? "default" : "outline"}
                            disabled={submitting !== null}
                            onClick={() => submitMatch(c.settlementId)}
                          >
                            {submitting === c.settlementId
                              ? "Linking…"
                              : highlight
                                ? "Match"
                                : "Select"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
