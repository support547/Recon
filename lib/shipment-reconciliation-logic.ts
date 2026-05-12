/**
 * Shipment reconciliation — formulas and display logic ported from
 * `FBA Inventory/Public/shipment-reconciliation.html` (preserve behavior).
 */

export type ReconStatus =
  | "matched"
  | "case_needed"
  | "partial"
  | "excess"
  | "shortage";

export type ShipmentReconRow = {
  shipment_id: string;
  shipment_status: string;
  msku: string;
  title: string;
  asin: string;
  fnsku: string;
  ship_date: string;
  last_updated: string;
  days_open: number | "—";
  shipped_qty: number;
  received_qty: number;
  shortage: number;
  reimb_qty: number;
  pending: number;
  status: ReconStatus;
};

export type ActionCacheEntry = {
  case_raised: number;
  case_approved: number;
  case_amount: number;
  adj_qty: number;
  case_status: string | null;
  case_count: number;
  case_ids: string[];
};

const STATUS_PRI: Record<string, number> = {
  resolved: 5,
  approved: 4,
  raised: 3,
  pending: 2,
  rejected: 1,
  closed: 0,
};

export function trimCl(s: unknown): string {
  return String(s ?? "")
    .trim()
    .replace(/['"]/g, "");
}

export function buildReceiptQuantityMap(
  rows: { fnsku: string | null; quantity: number }[],
): Record<string, number> {
  const rcMap: Record<string, number> = {};
  for (const r of rows) {
    const k = trimCl(r.fnsku);
    if (!k) continue;
    rcMap[k] = (rcMap[k] ?? 0) + (Number(r.quantity) || 0);
  }
  return rcMap;
}

/** Lost_Inbound reimbursements only — matches legacy `reason.trim() === 'Lost_Inbound'` */
export function buildLostInboundReimbMap(
  rows: { fnsku: string | null; reason: string | null; quantity: number }[],
): Record<string, number> {
  const riMap: Record<string, number> = {};
  for (const r of rows) {
    if (String(r.reason ?? "").trim() !== "Lost_Inbound") continue;
    const k = trimCl(r.fnsku);
    if (!k) continue;
    riMap[k] = (riMap[k] ?? 0) + (Number(r.quantity) || 0);
  }
  return riMap;
}

export type ShipmentMeta = {
  status: string;
  /** yyyy-mm-dd from last shipment_status row */
  dateKey: string;
  lastUpdated: Date | null;
};

export function buildShipmentMetaMap(
  rows: {
    shipmentId: string | null;
    status: string | null;
    lastUpdated: Date | null;
  }[],
): Record<string, ShipmentMeta> {
  const shipMap: Record<string, ShipmentMeta> = {};
  for (const r of rows) {
    const sid = String(r.shipmentId ?? "").trim();
    if (!sid) continue;
    const st = String(r.status ?? "Unknown").trim();
    const lu = r.lastUpdated;
    const prev = shipMap[sid];
    if (
      !prev ||
      (lu && (!prev.lastUpdated || lu > prev.lastUpdated))
    ) {
      shipMap[sid] = {
        status: st,
        dateKey: lu ? lu.toISOString().split("T")[0] : "",
        lastUpdated: lu,
      };
    }
  }
  return shipMap;
}

export function computeReconRows(args: {
  shippedRows: {
    shipmentId: string | null;
    msku: string;
    title: string | null;
    asin: string | null;
    fnsku: string | null;
    quantity: number;
    shipDate: Date | null;
  }[];
  rcMap: Record<string, number>;
  riMap: Record<string, number>;
  shipMap: Record<string, ShipmentMeta>;
  filterShipmentStatus: string;
  filterShipmentId: string;
}): ShipmentReconRow[] {
  const {
    shippedRows,
    rcMap,
    riMap,
    shipMap,
    filterShipmentStatus,
    filterShipmentId,
  } = args;

  const shipped = shippedRows.filter((s) => {
    const sid = String(s.shipmentId ?? "").trim();
    const meta = shipMap[sid];
    const st = meta?.status ?? "Unknown";
    if (filterShipmentId !== "all" && sid !== filterShipmentId) return false;
    if (
      filterShipmentStatus !== "all" &&
      st.toLowerCase() !== filterShipmentStatus.toLowerCase()
    )
      return false;
    return true;
  });

  return shipped.map((s) => {
    const sid = String(s.shipmentId ?? "").trim() || "—";
    const meta = shipMap[sid];
    const st = meta?.status ?? "Unknown";
    const fk = trimCl(s.fnsku);
    const shipped_qty = Number(s.quantity) || 0;
    const received_qty = fk ? rcMap[fk] ?? 0 : 0;
    const shortage = Math.max(0, shipped_qty - received_qty);
    const reimb_qty = fk ? riMap[fk] ?? 0 : 0;
    const pending = Math.max(0, shortage - reimb_qty);

    let status: ReconStatus = "matched";
    if (shortage > 0 && pending > 0) status = "case_needed";
    else if (shortage > 0 && pending === 0) status = "partial";
    else if (received_qty > shipped_qty) status = "excess";

    let ship_date = "—";
    if (s.shipDate) {
      try {
        ship_date = new Date(s.shipDate).toISOString().split("T")[0];
      } catch {
        /* noop */
      }
    }
    let last_updated = "—";
    let days_open: number | "—" = "—";
    const lu = meta?.lastUpdated;
    if (lu) {
      try {
        const lud = new Date(lu);
        if (!Number.isNaN(lud.getTime())) {
          last_updated = lud.toISOString().split("T")[0];
        }
      } catch {
        /* noop */
      }
    }
    if (ship_date !== "—" && last_updated !== "—") {
      try {
        const diff =
          new Date(last_updated).getTime() - new Date(ship_date).getTime();
        days_open = Math.round(diff / 86400000);
      } catch {
        /* noop */
      }
    }

    return {
      shipment_id: sid,
      shipment_status: st,
      msku: s.msku,
      title: s.title || "—",
      asin: s.asin || "—",
      fnsku: s.fnsku || "—",
      ship_date,
      last_updated,
      days_open,
      shipped_qty,
      received_qty,
      shortage,
      reimb_qty,
      pending,
      status,
    };
  });
}

export function mergeCaseIntoOverlay(
  overlay: Record<string, ActionCacheEntry>,
  keys: string[],
  patch: Omit<Partial<ActionCacheEntry>, "case_ids"> & {
    total_claimed?: number;
    total_approved?: number;
    total_amount?: number;
    case_count?: number;
    case_ids?: string;
    top_status?: string;
  },
) {
  for (const raw of keys) {
    const k = raw.trim();
    if (!k) continue;
    if (!overlay[k]) {
      overlay[k] = {
        case_raised: 0,
        case_approved: 0,
        case_amount: 0,
        adj_qty: 0,
        case_status: null,
        case_count: 0,
        case_ids: [],
      };
    }
    const ac = overlay[k];
    if (patch.total_claimed != null)
      ac.case_raised += Number(patch.total_claimed) || 0;
    if (patch.total_approved != null)
      ac.case_approved += Number(patch.total_approved) || 0;
    if (patch.total_amount != null)
      ac.case_amount += Number(patch.total_amount) || 0;
    if (patch.case_count != null)
      ac.case_count += Number(patch.case_count) || 0;
    if (patch.case_ids) ac.case_ids.push(patch.case_ids);
    const rank = STATUS_PRI[patch.top_status ?? ""] ?? 0;
    if (
      !ac.case_status ||
      rank > (STATUS_PRI[ac.case_status] ?? 0)
    ) {
      ac.case_status = patch.top_status ?? null;
    }
  }
}

/** Table row formulas — matches legacy `renderTable` inner calculations.
 *  FBA-accounting: any adjustment resolves discrepancy regardless of sign.
 *  `found` (+) adds back, `lost`/`damaged` (-) writes off; both close the gap.
 */
export function tableRowDerived(r: ShipmentReconRow, ca: ActionCacheEntry) {
  const approvedQty = ca.case_approved || 0;
  const approvedAmt = ca.case_amount || 0;
  const claimedQty = ca.case_raised || 0;
  const adjMag = Math.abs(ca.adj_qty || 0);
  const caseContribution = approvedQty > 0 ? approvedQty : claimedQty;
  const totalActioned = caseContribution + adjMag;
  const effectivePending = Math.max(0, r.pending - totalActioned);
  const topCaseStatus = ca.case_status;

  let statusBadgeKind:
    | "matched"
    | "excess"
    | "reimbursed"
    | "action_taken"
    | "case_raised"
    | "in_progress"
    | "partial_reimb"
    | "take_action";

  if (r.status === "matched" || r.status === "excess") {
    statusBadgeKind = r.status === "excess" ? "excess" : "matched";
  } else if (r.shortage === 0) {
    statusBadgeKind = "matched";
  } else if (approvedAmt > 0 || approvedQty >= r.shortage) {
    statusBadgeKind = "reimbursed";
  } else if (effectivePending <= 0) {
    statusBadgeKind = "action_taken";
  } else if (topCaseStatus === "raised" || topCaseStatus === "pending") {
    statusBadgeKind = "case_raised";
  } else if (totalActioned > 0) {
    statusBadgeKind = "in_progress";
  } else if (r.status === "partial") {
    statusBadgeKind = "partial_reimb";
  } else {
    statusBadgeKind = "take_action";
  }

  let pendingDisp:
    | { kind: "zero" }
    | { kind: "check"; was: number }
    | { kind: "partial"; effective: number; was: number }
    | { kind: "full"; pending: number };

  if (r.pending <= 0) pendingDisp = { kind: "zero" };
  else if (effectivePending <= 0)
    pendingDisp = { kind: "check", was: r.pending };
  else if (effectivePending < r.pending)
    pendingDisp = {
      kind: "partial",
      effective: effectivePending,
      was: r.pending,
    };
  else pendingDisp = { kind: "full", pending: r.pending };

  const reimbDisplayQty = Math.max(r.reimb_qty, approvedQty);
  const reimbShowCaseHint = approvedQty > 0 && r.reimb_qty === 0;

  return {
    approvedQty,
    approvedAmt,
    totalActioned,
    effectivePending,
    topCaseStatus,
    statusBadgeKind,
    pendingDisp,
    reimbDisplayQty,
    reimbShowCaseHint,
    pct:
      r.shipped_qty > 0
        ? Math.round((r.received_qty / r.shipped_qty) * 100)
        : 100,
  };
}

/** Drawer uses same canonical formula as table. Single source of truth. */
export function drawerEffectivePending(
  row: ShipmentReconRow,
  ca: ActionCacheEntry,
) {
  const approvedQty = ca.case_approved || 0;
  const claimedQty = ca.case_raised || 0;
  const caseContribution = approvedQty > 0 ? approvedQty : claimedQty;
  const adjMag = Math.abs(ca.adj_qty || 0);
  return Math.max(0, row.pending - caseContribution - adjMag);
}

export function drawerTotalActioned(ca: ActionCacheEntry) {
  const approvedQty = ca.case_approved || 0;
  const claimedQty = ca.case_raised || 0;
  const caseContribution = approvedQty > 0 ? approvedQty : claimedQty;
  return caseContribution + Math.abs(ca.adj_qty || 0);
}

export type DrawerAlertKind =
  | "reconciled"
  | "actioned"
  | "partial_reimb"
  | "action_required";

export function drawerAlertKind(
  row: ShipmentReconRow,
  ca: ActionCacheEntry,
): DrawerAlertKind {
  const _ep = drawerEffectivePending(row, ca);
  if (
    row.status === "matched" ||
    row.status === "excess" ||
    row.shortage === 0
  ) {
    return "reconciled";
  }
  if (_ep <= 0) return "actioned";
  if (row.status === "partial") return "partial_reimb";
  return "action_required";
}

const EMPTY_CA: ActionCacheEntry = {
  case_raised: 0,
  case_approved: 0,
  case_amount: 0,
  adj_qty: 0,
  case_status: null,
  case_count: 0,
  case_ids: [],
};

export function summaryStats(
  allRows: ShipmentReconRow[],
  overlay: Record<string, ActionCacheEntry> = {},
) {
  let matchedSkus = 0;
  let matchedQty = 0;
  let shortageSkus = 0;
  let shortQty = 0;
  let caseNeededSkus = 0;
  let caseNeededQty = 0;
  let pendingUnits = 0;
  let totalQty = 0;
  let reimbQty = 0;
  let caseRaisedSkus = 0;
  let caseRaisedQty = 0;
  let caseApprovedQty = 0;
  let adjSkus = 0;
  let adjQtyTotal = 0;

  for (const r of allRows) {
    totalQty += r.shipped_qty;
    reimbQty += r.reimb_qty;

    const fk = trimCl(r.fnsku);
    const ca = overlay[fk] ?? EMPTY_CA;
    const d = tableRowDerived(r, ca);

    pendingUnits += d.effectivePending;

    if (ca.case_count > 0) {
      caseRaisedSkus++;
      caseRaisedQty += ca.case_raised || 0;
      caseApprovedQty += ca.case_approved || 0;
    }

    if (ca.adj_qty !== 0) {
      adjSkus++;
      adjQtyTotal += Math.abs(ca.adj_qty);
    }

    if (d.statusBadgeKind === "matched" || d.statusBadgeKind === "excess") {
      matchedSkus++;
      matchedQty += r.shipped_qty;
      continue;
    }

    if (r.shortage > 0) {
      shortageSkus++;
      shortQty += r.shortage;
    }

    if (d.statusBadgeKind === "take_action") {
      caseNeededSkus++;
      caseNeededQty += d.effectivePending;
    }
  }

  return {
    totalSkus: allRows.length,
    matchedSkus,
    shortageSkus,
    caseNeededSkus,
    pendingUnits,
    totalQty,
    matchedQty,
    shortQty,
    caseQty: caseNeededQty,
    reimbQty,
    caseRaisedSkus,
    caseRaisedQty,
    caseApprovedQty,
    adjSkus,
    adjQty: adjQtyTotal,
  };
}

export function sortShipmentDropdownIds(
  ids: string[],
  shipMap: Record<string, ShipmentMeta>,
): string[] {
  const pri: Record<string, number> = {
    Closed: 0,
    Receiving: 1,
    Working: 2,
    Shipped: 3,
  };
  return [...ids].sort((a, b) => {
    const sa = shipMap[a]?.status ?? "Unknown";
    const sb = shipMap[b]?.status ?? "Unknown";
    return (pri[sa] ?? 9) - (pri[sb] ?? 9);
  });
}

export type ShipmentAggregateRow = {
  shipment_id: string;
  shipment_status: string;
  ship_date: string;
  last_updated: string;
  days_open: number | "—";
  skus: number;
  shipped: number;
  received: number;
  shortage: number;
  reimb: number;
  pending: number;
  matched: number;
  case_needed: number;
  partial: number;
};

/** Legacy `renderShipView` aggregation — keys fixed to trimmed shipment id */
export function aggregateShipments(
  filteredRows: ShipmentReconRow[],
): ShipmentAggregateRow[] {
  const g: Record<string, ShipmentAggregateRow> = {};
  for (const r of filteredRows) {
    const _sid = String(r.shipment_id ?? "").trim() || r.shipment_id;
    if (!g[_sid]) {
      g[_sid] = {
        shipment_id: _sid,
        shipment_status: r.shipment_status,
        ship_date: r.ship_date,
        last_updated: r.last_updated,
        days_open: r.days_open,
        skus: 0,
        shipped: 0,
        received: 0,
        shortage: 0,
        reimb: 0,
        pending: 0,
        matched: 0,
        case_needed: 0,
        partial: 0,
      };
    }
    const x = g[_sid];
    x.skus++;
    x.shipped += r.shipped_qty;
    x.received += r.received_qty;
    x.shortage += r.shortage;
    x.reimb += r.reimb_qty;
    x.pending += r.pending;
    if (r.status === "matched" || r.status === "excess") x.matched++;
    else if (r.status === "case_needed") x.case_needed++;
    else if (r.status === "partial") x.partial++;
  }
  return Object.values(g);
}
