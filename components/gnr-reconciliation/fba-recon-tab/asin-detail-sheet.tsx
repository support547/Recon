"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GnrV2StatusBadge } from "@/components/gnr-reconciliation/fba-recon-tab/status-badge-v2";
import { GNR_V2_GROUP_META } from "@/components/gnr-reconciliation/fba-recon-tab/status-badge-v2";
import { mergeMemberDetails } from "@/lib/gnr-reconciliation/v2/formula";
import type { GnrV2AsinRow } from "@/lib/gnr-reconciliation/v2/types";

/** Signed integer with explicit + / − (0 → "0"). */
function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

function copy(text: string, label = "Copied") {
  if (!text) return;
  void navigator.clipboard?.writeText(text);
  toast.success(`📋 ${label}`);
}

export function AsinDetailSheet({
  row,
  remarks,
  open,
  onOpenChange,
}: {
  row: GnrV2AsinRow | null;
  /** usedMsku|usedFnsku → remark text (read-only here). */
  remarks: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!row) return null;

  const detail = mergeMemberDetails(row.members);
  const groupLabel = GNR_V2_GROUP_META[row.actionGroup].label;

  function exportCsv() {
    if (!row) return;
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [];
    const push = (...cells: unknown[]) => lines.push(cells.map(esc).join(","));

    push("SECTION", "ASIN", row.asin);
    push("");
    push("SUMMARY", "Field", "Value");
    push("summary", "Status", row.status);
    push("summary", "Expected In", row.expectedInQty);
    push("summary", "Actual In", row.actualIn);
    push("summary", "Inbound Gap", row.inboundGap);
    push("summary", "Sales", row.salesSigned);
    push("summary", "Returns", row.returnsSigned);
    push("summary", "Removals", row.removalsSigned);
    push("summary", "Reimb", row.reimbSigned);
    push("summary", "Manual Adj", row.adjSigned);
    push("summary", "Computed End", row.computedEnding);
    push("summary", "Ledger End", row.ledgerEnding ?? "");
    push("summary", "Variance", row.variance ?? "");
    push("");
    push("MEMBERS", "Used MSKU", "Used FNSKU", "Condition", "Expected", "Actual", "Gap", "Computed", "Ledger", "Status", "Mixed", "Remark");
    for (const m of row.members) {
      push(
        "member", m.usedMsku, m.usedFnsku, m.usedCondition, m.expectedInQty, m.actualIn,
        m.inboundGap, m.isMixedSku ? "" : m.computedEnding, m.ledgerEnding ?? "",
        m.status, m.isMixedSku ? "yes" : "", remarks[`${m.usedMsku}|${m.usedFnsku}`] ?? "",
      );
    }
    push("");
    push("INBOUND_EVENTS", "Date", "Qty", "Reference ID", "FC", "Disposition", "FNSKU");
    for (const e of detail.inEvents) {
      push("inbound", e.adjDate, e.qty, e.referenceId, e.fc, e.disposition, e.fnsku);
    }
    push("");
    push("SALES", "Date", "Order ID", "Qty", "Amount", "FNSKU");
    for (const d of detail.sales) push("sale", d.date, d.orderId, d.qty, d.amount, d.fnsku);
    push("");
    push("RETURNS", "Date", "Order ID", "Qty", "Disposition", "FNSKU");
    for (const d of detail.returns) push("return", d.date, d.orderId, d.qty, d.disposition, d.fnsku);
    push("");
    push("REMOVALS", "Date", "Order ID", "Qty", "Source", "FNSKU");
    for (const d of detail.removals) push("removal", d.date, d.orderId, d.qty, d.source, d.fnsku);
    push("");
    push("LEDGER", "Disposition", "Qty");
    for (const d of detail.ledgerDispositions) push("ledger", d.disposition, d.qty);
    push("ledger", "Found", detail.whBreakdown.found);
    push("ledger", "Lost", detail.whBreakdown.lost);
    push("ledger", "Damaged", detail.whBreakdown.damaged);
    push("ledger", "Disposed", detail.whBreakdown.disposed);
    push("ledger", "Unsellable on-hand", row.unsellableOnHand);

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gnr_asin_${row.asin}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ ASIN detail exported");
  }

  const salesQtyTotal = detail.sales.reduce((s, d) => s + d.qty, 0);
  const salesAmtTotal = detail.sales.reduce((s, d) => s + d.amount, 0);
  const returnQtyTotal = detail.returns.reduce((s, d) => s + d.qty, 0);
  const removalQtyTotal = detail.removals.reduce((s, d) => s + d.qty, 0);
  const inboundTotal = detail.inEvents.reduce((s, e) => s + e.qty, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[720px]"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2 font-mono text-base">
            <button
              type="button"
              onClick={() => copy(row.asin, "ASIN copied")}
              className="inline-flex items-center gap-1 hover:underline"
              title="Copy ASIN"
            >
              {row.asin}
              <Copy className="size-3.5 text-muted-foreground" aria-hidden />
            </button>
          </SheetTitle>
          {row.title ? (
            <p className="text-xs font-normal text-muted-foreground" title={row.title}>
              {row.title}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <GnrV2StatusBadge status={row.status} />
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {groupLabel}
            </span>
            {row.gnrDate ? (
              <span className="text-[11px] text-muted-foreground">
                GNR {row.gnrDate} · {row.daysSince === 999 ? "—" : `${row.daysSince}d`}
              </span>
            ) : null}
            <span className="text-[11px] text-muted-foreground">
              {row.memberCount} SKU{row.memberCount > 1 ? "s" : ""}
              {row.mixedCount > 0 ? ` (+${row.mixedCount} mixed)` : ""}
            </span>
          </div>
          {row.conditions.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {row.conditions.map((c) => (
                <span key={c} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                  {c}
                </span>
              ))}
            </div>
          ) : null}
          {row.ledgerNote ? (
            <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
              ⚠ {row.ledgerNote}
            </p>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          {/* b) RECONCILIATION SUMMARY */}
          <Section title="Reconciliation summary">
            <div className="grid gap-3 sm:grid-cols-2">
              <EquationCard label="Inbound">
                <Eq term="Expected" value={row.expectedInQty} />
                <Eq term="Actual In" value={row.actualIn} />
                <div className="mt-1 flex items-center justify-between border-t pt-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">Gap</span>
                  <span
                    className={cn(
                      "font-mono text-sm font-bold tabular-nums",
                      row.inboundGap < 0 ? "text-red-600" : row.inboundGap > 0 ? "text-blue-600" : "text-emerald-600",
                    )}
                  >
                    {signed(row.inboundGap)}
                  </span>
                </div>
              </EquationCard>

              <EquationCard label="Balance">
                <Eq term="Actual In" value={row.actualIn} />
                <Eq term="Sales" value={row.salesSigned} signedTerm />
                <Eq term="Returns" value={row.returnsSigned} signedTerm />
                <Eq term="Removals" value={row.removalsSigned} signedTerm />
                <Eq term="Reimb" value={row.reimbSigned} signedTerm />
                <Eq term="Manual Adj" value={row.adjSigned} signedTerm />
                <div className="mt-1 flex items-center justify-between border-t pt-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">Computed End</span>
                  <span className="font-mono text-sm font-bold tabular-nums">{row.computedEnding}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Ledger End</span>
                  <span className="font-mono text-xs tabular-nums">{row.ledgerEnding ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Difference</span>
                  <span
                    className={cn(
                      "font-mono text-xs font-bold tabular-nums",
                      row.variance === null ? "text-slate-400" : row.variance < 0 ? "text-red-600" : row.variance > 0 ? "text-purple-600" : "text-emerald-600",
                    )}
                  >
                    {row.variance === null ? "—" : signed(row.variance)}
                  </span>
                </div>
              </EquationCard>
            </div>
          </Section>

          {/* c) MEMBER SKUs */}
          <Section title={`Member SKUs (${row.memberCount})`}>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <Th>Used MSKU</Th><Th>FNSKU</Th><Th>Condition</Th>
                    <Th right>Exp</Th><Th right>Act</Th><Th right>Gap</Th>
                    <Th right>Comp</Th><Th right>Ledger</Th><Th>Status</Th><Th>Remark</Th>
                  </tr>
                </thead>
                <tbody>
                  {row.members.map((m) => {
                    const rem = remarks[`${m.usedMsku}|${m.usedFnsku}`] ?? "";
                    return (
                      <tr
                        key={`${m.usedMsku}|${m.usedFnsku}`}
                        className={cn("border-t", m.isMixedSku && "bg-slate-50/60 text-slate-400")}
                      >
                        <Td mono className="max-w-[140px] truncate" title={m.usedMsku}>
                          {m.usedMsku.replace(/^Manual: /, "")}
                        </Td>
                        <Td mono>{m.usedFnsku}</Td>
                        <Td>{m.usedCondition}</Td>
                        <Td right>{m.expectedInQty}</Td>
                        <Td right>{m.actualIn}</Td>
                        <Td right>{signed(m.inboundGap)}</Td>
                        <Td right>{m.isMixedSku ? "—" : m.computedEnding}</Td>
                        <Td right>{m.ledgerEnding ?? "—"}</Td>
                        <Td>
                          <div className="flex items-center gap-1">
                            <GnrV2StatusBadge status={m.status} />
                            {!m.isMixedSku && !m.hasLedger ? (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-800">
                                no snapshot
                              </span>
                            ) : null}
                          </div>
                        </Td>
                        <Td className="max-w-[120px] truncate" title={rem}>{rem || "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {row.mixedCount > 0 ? (
              <p className="mt-1.5 text-[10px] italic text-muted-foreground">
                Grayed rows are mixed-SKU (share an FNSKU with regular stock) — excluded from the sums above.
              </p>
            ) : null}
          </Section>

          {/* d) INBOUND EVIDENCE */}
          <Section title="Ledger arrivals (reason 3)">
            {detail.inEvents.length === 0 ? (
              <Empty>No reason-3 arrivals on the ledger for this ASIN.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr><Th>Date</Th><Th right>Qty</Th><Th>Reference ID</Th><Th>FC</Th><Th>Disposition</Th><Th>FNSKU</Th></tr>
                  </thead>
                  <tbody>
                    {detail.inEvents.map((e, i) => (
                      <tr key={`${e.referenceId}-${e.fnsku}-${i}`} className="border-t">
                        <Td mono>{e.adjDate || "—"}</Td>
                        <Td right>+{e.qty}</Td>
                        <Td>
                          <button type="button" onClick={() => copy(e.referenceId, "Reference copied")} className="font-mono text-blue-700 hover:underline" title="Copy reference ID">
                            {e.referenceId || "—"}
                          </button>
                        </Td>
                        <Td>{e.fc || "—"}</Td>
                        <Td>{e.disposition || "—"}</Td>
                        <Td mono>{e.fnsku}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 font-semibold">
                    <tr>
                      <Td>Total</Td>
                      <Td right>{inboundTotal}</Td>
                      <Td className="text-muted-foreground" colSpan={4}>
                        vs Expected {row.expectedInQty} ({signed(inboundTotal - row.expectedInQty)})
                      </Td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>

          {/* e) FLOWS */}
          <Section title="Flows">
            <Collapsible title="Sales" count={detail.sales.length} total={`${salesQtyTotal} · $${salesAmtTotal.toFixed(2)}`}>
              <FlowTable
                cols={["Date", "Order ID", "Qty", "Amount", "FNSKU"]}
                rows={detail.sales.map((d) => [d.date || "—", <OrderId key="o" id={d.orderId} />, d.qty, `$${d.amount.toFixed(2)}`, d.fnsku])}
              />
            </Collapsible>
            <Collapsible title="Returns" count={detail.returns.length} total={`${returnQtyTotal}`}>
              <FlowTable
                cols={["Date", "Order ID", "Qty", "Disposition", "FNSKU"]}
                rows={detail.returns.map((d) => [d.date || "—", <OrderId key="o" id={d.orderId} />, d.qty, d.disposition || "—", d.fnsku])}
              />
            </Collapsible>
            <Collapsible title="Removals" count={detail.removals.length} total={`${removalQtyTotal}`}>
              <FlowTable
                cols={["Date", "Order ID", "Qty", "Source", "FNSKU"]}
                rows={detail.removals.map((d) => [d.date || "—", <OrderId key="o" id={d.orderId} />, d.qty, d.source, d.fnsku])}
              />
            </Collapsible>
          </Section>

          {/* f) LEDGER SNAPSHOT */}
          <Section title="Ledger snapshot">
            {row.whBreakdownSuppressed ? (
              <div className="rounded-md border border-dashed p-3 text-[11px] italic text-muted-foreground">
                {row.ledgerNote || "Ledger snapshot incomplete for this ASIN — ledger-side figures suppressed."}
              </div>
            ) : (
            <div className="space-y-2 rounded-md border p-3 text-[11px]">
              <KV label="Ending balance by disposition" />
              {detail.ledgerDispositions.length === 0 ? (
                <Empty>No ledger snapshot.</Empty>
              ) : (
                detail.ledgerDispositions.map((d) => (
                  <Row key={d.disposition} left={d.disposition} right={String(d.qty)} />
                ))
              )}
              <div className="border-t pt-2">
                <KV label="W/H events" />
                <Row left="Found" right={signed(detail.whBreakdown.found)} />
                <Row left="Lost" right={signed(-detail.whBreakdown.lost)} />
                <Row left="Damaged" right={signed(-detail.whBreakdown.damaged)} />
                <Row left="Disposed" right={signed(-detail.whBreakdown.disposed)} />
              </div>
              <div className="border-t pt-2">
                <KV label="Ledger Adj" />
                <Row left="Other events" right={signed(detail.ledgerAdjBreakdown.other)} />
                <Row left="Unknown events" right={signed(detail.ledgerAdjBreakdown.unknown)} />
                <Row left="less Actual In" right={signed(-detail.ledgerAdjBreakdown.actualIn)} />
              </div>
              <div className="border-t pt-2">
                {row.unsellableOnHand > 0 ? (
                  <div className="flex items-center justify-between rounded bg-amber-50 px-2 py-1">
                    <span className="font-semibold text-amber-800">Unsellable on-hand</span>
                    <span className="flex items-center gap-1.5 font-mono font-bold tabular-nums text-amber-800">
                      {row.unsellableOnHand}
                      <span className="rounded bg-amber-200 px-1 text-[8px] font-bold uppercase">needs removal</span>
                    </span>
                  </div>
                ) : (
                  <Row left="Unsellable on-hand" right="0" />
                )}
              </div>
            </div>
            )}
          </Section>

          {/* g) CASES & ADJUSTMENTS */}
          <Section title="Cases & adjustments">
            {row.members.every((m) => m.caseCount === 0 && m.adjQty === 0) ? (
              <Empty>No cases or manual adjustments for this ASIN.</Empty>
            ) : (
              <div className="space-y-2">
                {row.members
                  .filter((m) => m.caseCount > 0 || m.adjQty !== 0)
                  .map((m) => (
                    <div key={`${m.usedMsku}|${m.usedFnsku}`} className="rounded-md border p-2 text-[11px]">
                      <div className="mb-1 font-mono font-semibold">{m.usedFnsku}</div>
                      {m.caseCount > 0 ? (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                          <Row left="Cases" right={String(m.caseCount)} />
                          <Row left="Claimed" right={String(m.caseClaimedQty)} />
                          <Row left="Approved" right={`${m.caseApprovedQty} · $${m.caseApprovedAmount.toFixed(2)}`} />
                          <Row left="Status" right={m.caseTopStatus || "—"} />
                          {m.caseIds ? <Row left="Case ID(s)" right={m.caseIds} /> : null}
                        </div>
                      ) : null}
                      {m.adjQty !== 0 ? (
                        <Row left="Manual Adj" right={signed(m.adjSigned)} />
                      ) : null}
                    </div>
                  ))}
              </div>
            )}
          </Section>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          <Button size="sm" onClick={exportCsv}>⬇ Export ASIN detail (CSV)</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── small presentational helpers ───────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function EquationCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Eq({ term, value, signedTerm }: { term: string; value: number; signedTerm?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{term}</span>
      <span className="font-mono text-xs tabular-nums">{signedTerm ? signed(value) : value}</span>
    </div>
  );
}

function Collapsible({
  title,
  count,
  total,
  children,
}: {
  title: string;
  count: number;
  total: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {title} <span className="text-muted-foreground">({count})</span>
        </span>
        <span className="font-mono tabular-nums text-muted-foreground">{total}</span>
      </button>
      {open ? <div className="border-t p-2">{count === 0 ? <Empty>None.</Empty> : children}</div> : null}
    </div>
  );
}

function FlowTable({ cols, rows }: { cols: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            {cols.map((c, i) => (
              <Th key={c} right={i === 2}>{c}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr key={ri} className="border-t">
              {cells.map((cell, ci) => (
                <Td key={ci} right={ci === 2} mono={ci === cols.length - 1}>{cell}</Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderId({ id }: { id: string }) {
  if (!id) return <span className="text-muted-foreground">—</span>;
  return (
    <button type="button" onClick={() => copy(id, "Order ID copied")} className="font-mono text-blue-700 hover:underline" title="Copy order ID">
      {id}
    </button>
  );
}

function Th({ children, right, colSpan }: { children?: React.ReactNode; right?: boolean; colSpan?: number }) {
  return (
    <th colSpan={colSpan} className={cn("px-2 py-1.5 font-medium", right ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  mono,
  className,
  title,
  colSpan,
}: {
  children: React.ReactNode;
  right?: boolean;
  mono?: boolean;
  className?: string;
  title?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      className={cn("px-2 py-1.5", right && "text-right tabular-nums", mono && "font-mono text-[10px]", className)}
    >
      {children}
    </td>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{left}</span>
      <span className="font-mono tabular-nums">{right}</span>
    </div>
  );
}

function KV({ label }: { label: string }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-2 text-[11px] italic text-muted-foreground">{children}</p>;
}
