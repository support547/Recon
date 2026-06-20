import * as React from "react";

import { listAuditLog } from "@/actions/audit";
import { listUsers } from "@/actions/users";
import { AuditLogClient } from "@/components/settings/audit-log-client";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  let initialPage;
  let users;
  try {
    [initialPage, users] = await Promise.all([
      listAuditLog({ pagination: { page: 1, pageSize: 50 } }),
      listUsers(),
    ]);
  } catch (e) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Failed to load audit log
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {e instanceof Error ? e.message : String(e)}
          </p>
        </div>
      </main>
    );
  }
  return (
    <AuditLogClient
      initialPage={initialPage}
      users={users.map((u) => ({ id: u.id, email: u.email }))}
    />
  );
}
