import * as React from "react";

import {
  getBankReconciliationKpis,
  getBankTransactions,
} from "@/actions/bank-reconciliation";
import { BankReconClient } from "@/components/payment-reconciliation/bank-recon-client";
import BankReconLoading from "./loading";

export default async function BankReconPage() {
  const [initialItems, initialKpis] = await Promise.all([
    getBankTransactions({}),
    getBankReconciliationKpis(),
  ]);

  return (
    <React.Suspense fallback={<BankReconLoading />}>
      <BankReconClient
        initialItems={initialItems}
        initialKpis={initialKpis}
      />
    </React.Suspense>
  );
}
