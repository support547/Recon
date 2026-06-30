import type { Metadata } from "next";
import * as React from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  AUTH_ENABLED,
  DashboardChrome,
  FALLBACK_COMPANY_NAME,
  getCompanyChrome,
} from "./dashboard-chrome";
import DashboardLoading from "./loading";

export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  const companyId = session?.user?.companyId;
  const chrome = companyId ? await getCompanyChrome(companyId) : null;
  const displayName =
    chrome?.branding.displayName ?? chrome?.name ?? FALLBACK_COMPANY_NAME;
  return { title: `${displayName} — FBA Reconciliation` };
}

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Cheap-ish (~10-50ms: cookie + one control-DB user check per auth.ts:154-168).
  // Kept ABOVE the Suspense boundary so a null session yields a real HTTP 302
  // — no 200 body, no skeleton flash for logged-out users.
  const session = await auth();

  if (AUTH_ENABLED && !session?.user) {
    redirect("/login");
  }

  // Heavy awaits (tenant DB permissions + control DB chrome) happen inside
  // the Suspense boundary so the skeleton streams immediately for logged-in
  // users while those resolve.
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardChrome session={session}>{children}</DashboardChrome>
    </Suspense>
  );
}
