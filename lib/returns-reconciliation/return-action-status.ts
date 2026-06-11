import type { ReturnsReconRow } from "@/lib/returns-reconciliation/types";

/**
 * Qty-based display status for the By-MSKU Returns Reconciliation table.
 *
 * This is a render-time derivation from fields already on the row — it does NOT
 * affect the global `finalStatus`, the stat cards, the FNSKU-Status filter, the
 * Action Queue, or the ASIN tab. It exists so an operator reading the table can
 * tell, from the four visible qty columns, whether a return is settled (and how)
 * or still needs work.
 *
 * Rules (first match wins), ret = totalReturned:
 *  1. ret <= Inv (in FBA Summary)-> IN_INVENTORY (no action)
 *  2. ret <= Reimb               -> REIMBURSED   (no action)
 *  3. GNR-program MSKU, or
 *     GNR (LPN) & ret <= GNR     -> TO_GNR        (no action)
 *  4. manual adjustment present  -> ADJUSTED      (no action)
 *  5. order not found            -> NOT_FOUND     (action)
 *  6. otherwise (incl. partial)  -> TAKE_ACTION   (action)
 *
 * Settled states (Inventory / Reimbursement / GNR) are checked FIRST — a return
 * confirmed back in inventory (or reimbursed / transferred to GNR) is settled
 * even if its order is missing from the sales-data upload. Order-not-found only
 * surfaces when the return is not otherwise settled.
 *
 * Precedence for "no action" is Inventory > Reimbursement > GNR. A return that
 * Amazon recorded back in FBA (FBA Summary customerReturns) is settled as
 * IN_INVENTORY whether sellable or damaged — the unit is accounted for.
 */
export type ReturnActionStatus =
  | "IN_INVENTORY"
  | "REIMBURSED"
  | "TO_GNR"
  | "ADJUSTED"
  | "NOT_FOUND"
  | "TAKE_ACTION";

export function returnActionStatus(row: ReturnsReconRow): {
  status: ReturnActionStatus;
  needsAction: boolean;
} {
  const ret = row.totalReturned;
  const inv = row.inventoryQty;
  const reimb = row.reimbOrderMskuQty;
  const gnr = row.gnrLpnQty;
  // Approved case units count toward coverage, like a reimbursement. A still-open
  // case does NOT settle the row — it stays actionable (Take Action / Not Found).
  const coveredByReimb = reimb + row.caseReimbQty;

  let status: ReturnActionStatus;

  // 1. Return confirmed back in FBA inventory (matched in FBA Summary
  //    customerReturns for this MSKU + disposition + date) — settled, regardless
  //    of sellable, and wins even when the order is missing from sales data.
  if (ret > 0 && ret <= inv) {
    status = "IN_INVENTORY";
  }
  // 2. Fully covered by reimbursement and/or an approved case — settled.
  else if ((reimb > 0 || row.caseReimbQty > 0) && ret <= coveredByReimb) {
    status = "REIMBURSED";
  }
  // 3. Transferred to GNR — native GNR-program MSKU, or LPN-confirmed transfer.
  else if (row.ownershipStatus === "GNR_TRACKING" || (gnr > 0 && ret <= gnr)) {
    status = "TO_GNR";
  }
  // 4. Manually adjusted — operator closed the row by hand; no further action.
  else if (row.adjQty !== 0) {
    status = "ADJUSTED";
  }
  // 5. Order missing from sales data and not otherwise settled — investigate.
  else if (row.ownershipStatus === "ORDER_NOT_FOUND") {
    status = "NOT_FOUND";
  }
  // 6. Anything not settled above (incl. open cases, partial cover) needs action.
  else {
    status = "TAKE_ACTION";
  }

  const needsAction = status === "NOT_FOUND" || status === "TAKE_ACTION";

  return { status, needsAction };
}

/** Status values in display order — drives the Status filter dropdown. */
export const RETURN_ACTION_STATUS_ORDER: ReturnActionStatus[] = [
  "IN_INVENTORY",
  "REIMBURSED",
  "TO_GNR",
  "ADJUSTED",
  "NOT_FOUND",
  "TAKE_ACTION",
];

/** Short label + chip classes per status. Tints mirror final-status.ts. */
export const RETURN_ACTION_BADGE: Record<
  ReturnActionStatus,
  { label: string; cls: string }
> = {
  IN_INVENTORY: { label: "In Inventory", cls: "bg-emerald-50 text-emerald-700" },
  REIMBURSED:   { label: "Reimbursed",   cls: "bg-blue-50 text-blue-700" },
  TO_GNR:       { label: "To GNR",       cls: "bg-[#EEEDFE] text-[#534AB7]" },
  ADJUSTED:     { label: "Adjusted",     cls: "bg-violet-50 text-violet-700" },
  NOT_FOUND:    { label: "Not Found",    cls: "bg-[#F7C1C1] text-[#791F1F]" },
  TAKE_ACTION:  { label: "Take Action",  cls: "bg-[#F7C1C1] text-[#791F1F]" },
};

/** Settled = the three no-action statuses. Single source of truth. */
export const SETTLED_STATUSES: ReturnActionStatus[] = [
  "IN_INVENTORY",
  "REIMBURSED",
  "TO_GNR",
];

export type StatusTally = { rows: number; units: number };

export type ReturnActionTally = {
  perStatus: Record<ReturnActionStatus, StatusTally>;
  total: StatusTally;
  settled: StatusTally;
  takeAction: StatusTally;
  notFound: StatusTally;
  /**
   * Rows with a claimed case. `rows` = SKUs with caseClaimedQty > 0, `units` =
   * sum of claimed quantity. Cuts across the derived status (a case row may
   * still read Take Action until the case is approved).
   */
  cases: StatusTally;
  /**
   * Rows with a manual adjustment. `rows` = SKUs with a non-zero adjQty,
   * `units` = sum of adjusted quantity. Also a cross-cut.
   */
  adjustments: StatusTally;
};

/** Tally rows + units (totalReturned) per derived status in a single pass. */
export function tallyReturnActionStatus(
  rows: ReturnsReconRow[],
): ReturnActionTally {
  const empty = (): StatusTally => ({ rows: 0, units: 0 });
  const perStatus: Record<ReturnActionStatus, StatusTally> = {
    IN_INVENTORY: empty(),
    REIMBURSED: empty(),
    TO_GNR: empty(),
    ADJUSTED: empty(),
    NOT_FOUND: empty(),
    TAKE_ACTION: empty(),
  };
  let totalUnits = 0;
  const cases = empty();
  const adjustments = empty();
  for (const r of rows) {
    const { status } = returnActionStatus(r);
    perStatus[status].rows++;
    perStatus[status].units += r.totalReturned;
    totalUnits += r.totalReturned;
    // Cross-cut operator actions — counted independently per card.
    if (r.caseClaimedQty > 0) {
      cases.rows++;
      cases.units += r.caseClaimedQty;
    }
    if (r.adjQty !== 0) {
      adjustments.rows++;
      adjustments.units += r.adjQty;
    }
  }
  const sum = (...keys: ReturnActionStatus[]): StatusTally =>
    keys.reduce<StatusTally>(
      (a, k) => ({
        rows: a.rows + perStatus[k].rows,
        units: a.units + perStatus[k].units,
      }),
      empty(),
    );
  return {
    perStatus,
    total: { rows: rows.length, units: totalUnits },
    settled: sum(...SETTLED_STATUSES),
    takeAction: perStatus.TAKE_ACTION,
    notFound: perStatus.NOT_FOUND,
    cases,
    adjustments,
  };
}

/** Card/dropdown filter groups (a group expands to >=1 concrete status). */
export type StatusCardFilter = "ALL" | "SETTLED" | "TAKE_ACTION" | "NOT_FOUND";

/** Expand a card/dropdown selection to the concrete statuses it matches. */
export function statusesForFilter(
  f: StatusCardFilter | ReturnActionStatus,
): ReturnActionStatus[] {
  if (f === "ALL") return RETURN_ACTION_STATUS_ORDER;
  if (f === "SETTLED") return SETTLED_STATUSES;
  if (f === "TAKE_ACTION") return ["TAKE_ACTION"];
  if (f === "NOT_FOUND") return ["NOT_FOUND"];
  return [f];
}
