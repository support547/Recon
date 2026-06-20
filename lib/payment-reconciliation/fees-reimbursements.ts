export type FeesReimbGroup =
  | "INBOUND"
  | "REIMBURSEMENT"
  | "REVERSAL"
  | "OTHER_FEE"
  | "TAX_RETROCHARGE"
  | "UNCATEGORIZED";

export interface ChargeClassification {
  group: FeesReimbGroup;
  category: string;
}

const INBOUND_DESCRIPTIONS = new Set<string>([
  "Inbound Transportation Fee",
  "FBA Inbound Placement Service Fee",
  "FBA Inbound Transportation Program Fee",
]);

const REIMBURSEMENT_DESCRIPTIONS = new Set<string>([
  "WAREHOUSE_LOST",
  "WAREHOUSE_DAMAGE",
  "WAREHOUSE_DAMAGE_EXCEPTION",
  "MISSING_FROM_INBOUND",
  "FREE_REPLACEMENT_REFUND_ITEMS",
  "CS_ERROR_ITEMS",
  "RE_EVALUATION",
]);

const REVERSAL_DESCRIPTIONS = new Set<string>([
  "REVERSAL_REIMBURSEMENT",
  "COMPENSATED_CLAWBACK",
  "MISSING_FROM_INBOUND_CLAWBACK",
]);

export function classifyChargeLine(
  transactionType: string | null | undefined,
  amountDescription: string | null | undefined,
): ChargeClassification | null {
  const tt = (transactionType ?? "").trim();
  const ad = (amountDescription ?? "").trim();

  if (tt === "Order" || tt === "Refund") return null;

  if (tt === "Grade and Resell Fees") {
    return { group: "OTHER_FEE", category: "GRADE_RESELL" };
  }
  if (tt === "FBAFees") {
    return { group: "OTHER_FEE", category: "FBA_FEE" };
  }
  if (tt === "Order_Retrocharge" || tt === "Refund_Retrocharge") {
    return { group: "TAX_RETROCHARGE", category: "TAX_TRUEUP" };
  }

  if (INBOUND_DESCRIPTIONS.has(ad)) {
    return { group: "INBOUND", category: ad };
  }
  if (REIMBURSEMENT_DESCRIPTIONS.has(ad)) {
    return { group: "REIMBURSEMENT", category: ad };
  }
  if (REVERSAL_DESCRIPTIONS.has(ad)) {
    return { group: "REVERSAL", category: ad };
  }
  if (ad === "Storage Fee" || ad === "StorageRenewalBilling") {
    return { group: "OTHER_FEE", category: "STORAGE" };
  }
  if (ad === "RemovalComplete") {
    return { group: "OTHER_FEE", category: "REMOVAL" };
  }
  if (ad === "Subscription Fee") {
    return { group: "OTHER_FEE", category: "SUBSCRIPTION" };
  }
  if (ad === "Payable to Amazon") {
    return { group: "OTHER_FEE", category: "MISC" };
  }

  return { group: "UNCATEGORIZED", category: ad };
}

export interface CategoryAgg {
  category: string;
  lineCount: number;
  total: number;
}

export interface GroupAgg {
  group: FeesReimbGroup;
  lineCount: number;
  total: number;
  categories: CategoryAgg[];
}

export interface FeesReimbSummary {
  groups: Record<FeesReimbGroup, GroupAgg>;
  uncategorizedDescriptions: string[];
  totalLineCount: number;
  totalAmount: number;
}

const EMPTY_GROUPS: FeesReimbGroup[] = [
  "INBOUND",
  "REIMBURSEMENT",
  "REVERSAL",
  "OTHER_FEE",
  "TAX_RETROCHARGE",
  "UNCATEGORIZED",
];

export function emptyGroup(group: FeesReimbGroup): GroupAgg {
  return { group, lineCount: 0, total: 0, categories: [] };
}

export function aggregateClassifiedLines(
  lines: Array<{
    transactionType: string | null;
    amountDescription: string | null;
    amount: number;
  }>,
): FeesReimbSummary {
  const groupMap = new Map<FeesReimbGroup, GroupAgg>();
  const categoryMap = new Map<string, CategoryAgg>();
  const uncategorizedDescs = new Set<string>();

  for (const g of EMPTY_GROUPS) groupMap.set(g, emptyGroup(g));

  let totalLineCount = 0;
  let totalAmount = 0;

  for (const line of lines) {
    const cls = classifyChargeLine(line.transactionType, line.amountDescription);
    if (!cls) continue;

    const grp = groupMap.get(cls.group)!;
    grp.lineCount += 1;
    grp.total += line.amount;

    const catKey = `${cls.group}::${cls.category}`;
    const cat = categoryMap.get(catKey);
    if (cat) {
      cat.lineCount += 1;
      cat.total += line.amount;
    } else {
      const newCat: CategoryAgg = {
        category: cls.category,
        lineCount: 1,
        total: line.amount,
      };
      categoryMap.set(catKey, newCat);
      grp.categories.push(newCat);
    }

    if (cls.group === "UNCATEGORIZED") {
      uncategorizedDescs.add(cls.category || "(empty)");
    }

    totalLineCount += 1;
    totalAmount += line.amount;
  }

  for (const grp of groupMap.values()) {
    grp.categories.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }

  const groups = {} as Record<FeesReimbGroup, GroupAgg>;
  for (const g of EMPTY_GROUPS) groups[g] = groupMap.get(g)!;

  return {
    groups,
    uncategorizedDescriptions: Array.from(uncategorizedDescs).sort(),
    totalLineCount,
    totalAmount,
  };
}
