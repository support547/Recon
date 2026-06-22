import { classifyChargeLine } from "@/lib/payment-reconciliation/fees-reimbursements";

export interface InboundReconShippedInput {
  shipmentId: string | null;
}

export interface InboundReconStatusInput {
  shipmentId: string | null;
  createDate: string | null;
  closeDate: string | null;
  totalSkus: number | null;
  unitsExpected: number | null;
  unitsLocated: number | null;
  status: string | null;
}

export interface InboundReconSettlementInput {
  transactionType: string | null;
  amountDescription: string | null;
  shipmentId: string | null;
  amount: number;
}

export interface InboundReconRow {
  shipmentId: string;
  createDate: string | null;
  closeDate: string | null;
  totalSkus: number | null;
  unitsExpected: number | null;
  unitsLocated: number | null;
  status: string | null;
  amountsByType: Record<string, number>;
  totalCharges: number;
  hasShortage: boolean;
  hasShipmentStatus: boolean;
  hasCharges: boolean;
}

export interface InboundReconKpis {
  shipments: number;
  totalCharges: number;
  shipmentsCharged: number;
  shipmentsNotCharged: number;
  shipmentsWithShortage: number;
}

export interface InboundReconPayload {
  rows: InboundReconRow[];
  chargeTypes: string[];
  kpis: InboundReconKpis;
  unmatchedChargeCount: number;
  unmatchedChargeAmount: number;
}

const INBOUND_TYPE_ORDER = [
  "Inbound Transportation Fee",
  "FBA Inbound Placement Service Fee",
];

export function computeInboundRecon(
  shipped: InboundReconShippedInput[],
  statuses: InboundReconStatusInput[],
  settlements: InboundReconSettlementInput[],
): InboundReconPayload {
  const universe = new Set<string>();
  for (const s of shipped) {
    if (s.shipmentId) universe.add(s.shipmentId);
  }

  const statusByShipment = new Map<string, InboundReconStatusInput>();
  for (const s of statuses) {
    if (!s.shipmentId) continue;
    statusByShipment.set(s.shipmentId, s);
  }

  const chargesByShipment = new Map<
    string,
    { amountsByType: Map<string, number>; total: number }
  >();
  const typeSet = new Set<string>();
  let unmatchedChargeCount = 0;
  let unmatchedChargeAmount = 0;

  for (const r of settlements) {
    const cls = classifyChargeLine(r.transactionType, r.amountDescription);
    if (!cls || cls.group !== "INBOUND") continue;
    const shipmentId = (r.shipmentId ?? "").trim();
    if (!shipmentId) continue;
    typeSet.add(cls.category);

    if (!universe.has(shipmentId)) {
      unmatchedChargeCount += 1;
      unmatchedChargeAmount += r.amount;
      continue;
    }

    let agg = chargesByShipment.get(shipmentId);
    if (!agg) {
      agg = { amountsByType: new Map(), total: 0 };
      chargesByShipment.set(shipmentId, agg);
    }
    agg.amountsByType.set(
      cls.category,
      (agg.amountsByType.get(cls.category) ?? 0) + r.amount,
    );
    agg.total += r.amount;
  }

  const orderedTypes: string[] = [];
  for (const preferred of INBOUND_TYPE_ORDER) {
    if (typeSet.has(preferred)) {
      orderedTypes.push(preferred);
      typeSet.delete(preferred);
    }
  }
  for (const remaining of Array.from(typeSet).sort()) {
    orderedTypes.push(remaining);
  }

  const rows: InboundReconRow[] = [];
  let totalCharges = 0;
  let shipmentsCharged = 0;
  let shipmentsWithShortage = 0;

  for (const shipmentId of universe) {
    const st = statusByShipment.get(shipmentId);
    const ch = chargesByShipment.get(shipmentId);

    const amountsByType: Record<string, number> = {};
    if (ch) {
      for (const t of orderedTypes) {
        if (ch.amountsByType.has(t)) {
          amountsByType[t] = ch.amountsByType.get(t)!;
        }
      }
    }

    const hasCharges = !!ch;
    const totalShipmentCharges = ch?.total ?? 0;
    totalCharges += totalShipmentCharges;
    if (hasCharges) shipmentsCharged += 1;

    const hasShortage =
      st != null &&
      st.unitsExpected != null &&
      st.unitsLocated != null &&
      st.unitsLocated < st.unitsExpected;
    if (hasShortage) shipmentsWithShortage += 1;

    rows.push({
      shipmentId,
      createDate: st?.createDate ?? null,
      closeDate: st?.closeDate ?? null,
      totalSkus: st?.totalSkus ?? null,
      unitsExpected: st?.unitsExpected ?? null,
      unitsLocated: st?.unitsLocated ?? null,
      status: st?.status ?? null,
      amountsByType,
      totalCharges: totalShipmentCharges,
      hasShortage,
      hasShipmentStatus: !!st,
      hasCharges,
    });
  }

  rows.sort((a, b) => {
    const ad = a.createDate ?? "";
    const bd = b.createDate ?? "";
    if (ad !== bd) return ad < bd ? 1 : -1;
    return a.shipmentId.localeCompare(b.shipmentId);
  });

  return {
    rows,
    chargeTypes: orderedTypes,
    kpis: {
      shipments: universe.size,
      totalCharges,
      shipmentsCharged,
      shipmentsNotCharged: universe.size - shipmentsCharged,
      shipmentsWithShortage,
    },
    unmatchedChargeCount,
    unmatchedChargeAmount,
  };
}
