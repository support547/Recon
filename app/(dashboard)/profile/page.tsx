import * as React from "react";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { getMyProfile } from "@/actions/profile";
import { ProfileClient } from "@/components/profile/profile-client";

export const dynamic = "force-dynamic";

const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

export default async function ProfilePage() {
  let profile;
  try {
    profile = await getMyProfile();
  } catch (e) {
    // Preserve framework control-flow signals (redirect / notFound).
    if (isRedirectError(e)) throw e;
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Failed to load profile
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {e instanceof Error ? e.message : String(e)}
          </p>
        </div>
      </main>
    );
  }
  if (!profile) {
    if (!AUTH_ENABLED) {
      // Dev mode: requireSession returns a stub "system" admin with no DB row.
      // Show a friendly notice instead of pretending the page is missing.
      return (
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              Profile not available while auth is disabled
            </p>
            <p className="mt-1 text-xs text-amber-800">
              This page shows the signed-in user&apos;s own profile.
              <code className="mx-1 rounded bg-white/70 px-1 py-0.5 text-[11px]">
                AUTH_ENABLED=false
              </code>
              uses a stub admin with no database row, so there is nothing to
              display. Flip <code className="mx-1 rounded bg-white/70 px-1 py-0.5 text-[11px]">AUTH_ENABLED=true</code>
              and sign in to see your profile.
            </p>
          </div>
        </main>
      );
    }
    // Auth enabled but no row for this session id — the user was removed or
    // the JWT is stale. The right answer for a "my account" page is to send
    // them back to /login, not 404. Self-service must never depend on a
    // permission check, and must never claim the page itself doesn't exist.
    redirect("/login");
  }
  return <ProfileClient profile={profile} />;
}
