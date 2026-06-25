import * as React from "react";

import { getCompanyBranding } from "@/actions/branding";
import { CompanyBrandingClient } from "@/components/settings/company-branding-client";
import { isAuthzError } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  let snapshot;
  try {
    snapshot = await getCompanyBranding();
  } catch (e) {
    const forbidden = isAuthzError(e) && e.code === "FORBIDDEN";
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            {forbidden ? "Admins only" : "Failed to load branding"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {e instanceof Error ? e.message : String(e)}
          </p>
        </div>
      </main>
    );
  }
  return <CompanyBrandingClient snapshot={snapshot} />;
}
