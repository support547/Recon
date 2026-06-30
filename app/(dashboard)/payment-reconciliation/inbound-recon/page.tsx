import * as React from "react";

import { getInboundShipments } from "@/actions/inbound-recon";
import { InboundReconClient } from "@/components/payment-reconciliation/inbound-recon-client";
import InboundReconLoading from "./loading";

export default async function InboundReconPage() {
  const initialItems = await getInboundShipments({});

  return (
    <React.Suspense fallback={<InboundReconLoading />}>
      <InboundReconClient initialItems={initialItems} />
    </React.Suspense>
  );
}
