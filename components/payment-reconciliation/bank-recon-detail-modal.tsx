"use client";

import * as React from "react";

import { getSettlementDetailForBankTxn } from "@/actions/bank-reconciliation";
import type { MatchedSettlementDetail } from "@/lib/bank/types";
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

function fmtNum(v: string | null | undefined, digits = 2): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankTxnId: string | null;
};

export function BankReconDetailModal({
  open,
  onOpenChange,
  bankTxnId,
}: Props) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<MatchedSettlementDetail | null>(null);

  React.useEffect(() => {
    if (!open || !bankTxnId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    getSettlementDetailForBankTxn(bankTxnId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) setError(res.error ?? "Failed to load settlement.");
        else setData(res.data ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, bankTxnId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(92vh,720px)] w-full flex-col gap-0 overflow-hidden sm:max-w-3xl"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>Matched settlement</DialogTitle>
          <DialogDescription>
            Read-only view of the linked settlement report.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : data ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Settlement
                  </div>
                  <div className="font-mono text-xs">{data.settlementId}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Store / Currency
                  </div>
                  <div className="text-sm">
                    {data.store ?? "—"} / {data.currency ?? "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Status
                  </div>
                  <Badge
                    className={
                      data.matchStatus === "DISCREPANCY"
                        ? "bg-red-600 text-white"
                        : "bg-emerald-600 text-white"
                    }
                  >
                    {data.matchStatus}
                  </Badge>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Deposit date
                  </div>
                  <div className="text-sm">{data.depositDate ?? "—"}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Period
                  </div>
                  <div className="text-sm">
                    {data.startDate && data.endDate
                      ? `${data.startDate} → ${data.endDate}`
                      : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Expected ({data.currency ?? "—"})
                  </div>
                  <div className="font-mono text-sm">
                    {fmtNum(data.totalAmount)}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Bank received (USD)
                  </div>
                  <div className="font-mono text-sm">
                    {fmtNum(data.amountUsdBankReceived)}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {data.currency === "CAD"
                      ? "Implied FX"
                      : "Variance USD"}
                  </div>
                  <div className="font-mono text-sm">
                    {data.currency === "CAD"
                      ? fmtNum(data.impliedFxRate, 4)
                      : fmtNum(data.varianceUsd)}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border">
                <div className="flex items-center justify-between border-b border-border bg-slate-50 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-700">
                  <span>
                    Line breakdown · {data.lineCount.toLocaleString()} rows
                  </span>
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Transaction</th>
                        <th className="px-3 py-2 text-left">Amount type</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right">Sum</th>
                        <th className="px-3 py-2 text-right">Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lineBreakdown.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-4 text-center text-muted-foreground"
                          >
                            No lines found.
                          </td>
                        </tr>
                      ) : (
                        data.lineBreakdown.map((b, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 text-xs">
                              {b.transactionType ?? "—"}
                            </td>
                            <td className="px-3 py-1.5 text-xs">
                              {b.amountType ?? "—"}
                            </td>
                            <td className="px-3 py-1.5 text-xs">
                              {b.amountDescription ?? "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                              {fmtNum(b.sum)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                              {b.rows.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
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
