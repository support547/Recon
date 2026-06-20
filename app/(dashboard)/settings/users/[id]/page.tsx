import * as React from "react";
import { notFound } from "next/navigation";

import { getUser } from "@/actions/users";
import { UserDetailClient } from "@/components/settings/user-detail-client";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let user;
  try {
    user = await getUser(id);
  } catch (e) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Failed to load user
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {e instanceof Error ? e.message : String(e)}
          </p>
        </div>
      </main>
    );
  }
  if (!user) notFound();
  return <UserDetailClient user={user} />;
}
