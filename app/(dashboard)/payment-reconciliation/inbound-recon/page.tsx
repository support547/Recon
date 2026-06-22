import * as React from "react";

import { getInboundShipments } from "@/actions/inbound-recon";
import { InboundReconClient } from "@/components/payment-reconciliation/inbound-recon-client";

export default async function InboundReconPage() {
  const initialItems = await getInboundShipments({});

  return (
    <React.Suspense fallback={null}>
      <InboundReconClient initialItems={initialItems} />
    </React.Suspense>
  );
}
