"use client";

import * as React from "react";
import { toast } from "sonner";
import { AuditAction } from "@prisma/client";

import {
  listAuditLog,
  type AuditLogPage,
  type AuditLogRow,
} from "@/actions/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ALL = "__all__";

function fmtDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString();
}

function actionTone(action: AuditAction): string {
  if (action === AuditAction.LOGIN_SUCCESS) return "text-emerald-700";
  if (action === AuditAction.LOGIN_FAILED) return "text-red-700";
  if (action.startsWith("USER_DELETED")) return "text-red-700";
  if (action.startsWith("USER_SUSPENDED")) return "text-amber-700";
  return "text-foreground";
}

function parseDateInput(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function AuditLogClient({
  initialPage,
  users,
}: {
  initialPage: AuditLogPage;
  users: { id: string; email: string }[];
}) {
  const [data, setData] = React.useState<AuditLogPage>(initialPage);
  const [loading, setLoading] = React.useState(false);

  const [userId, setUserId] = React.useState<string>(ALL);
  const [action, setAction] = React.useState<string>(ALL);
  const [from, setFrom] = React.useState<string>("");
  const [to, setTo] = React.useState<string>("");
  const [page, setPage] = React.useState(initialPage.page);
  const [pageSize, setPageSize] = React.useState(initialPage.pageSize);

  const load = React.useCallback(
    async (overrides?: { page?: number; pageSize?: number }) => {
      setLoading(true);
      try {
        const next = await listAuditLog({
          filters: {
            userId: userId === ALL ? undefined : userId,
            action: action === ALL ? undefined : (action as AuditAction),
            from: parseDateInput(from),
            to: parseDateInput(to),
          },
          pagination: {
            page: overrides?.page ?? page,
            pageSize: overrides?.pageSize ?? pageSize,
          },
        });
        setData(next);
        if (overrides?.page !== undefined) setPage(overrides.page);
        if (overrides?.pageSize !== undefined) setPageSize(overrides.pageSize);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load audit log.");
      } finally {
        setLoading(false);
      }
    },
    [userId, action, from, to, page, pageSize],
  );

  function clearFilters() {
    setUserId(ALL);
    setAction(ALL);
    setFrom("");
    setTo("");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Audit Log</h2>
        <p className="text-xs text-muted-foreground">
          Append-only log of login activity and admin actions.
        </p>
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="f-user">User</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger id="f-user" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-action">Action</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger id="f-action" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actions</SelectItem>
              {Object.values(AuditAction).map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-from">From</Label>
          <Input
            id="f-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-to">To</Label>
          <Input
            id="f-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void load({ page: 1 })}
            disabled={loading}
          >
            {loading ? "Loading…" : "Apply"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              clearFilters();
              void load({ page: 1 });
            }}
            disabled={loading}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[170px]">When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="w-[120px]">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No audit events.
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((r: AuditLogRow) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtDate(r.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.actorEmail ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={`text-xs font-medium ${actionTone(r.action)}`}>
                    {r.action}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.targetEmail ?? r.targetId ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">{r.summary}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.ipAddress ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <div>
          Showing {data.rows.length} of {data.total} · page {data.page} of {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(data.pageSize)}
            onValueChange={(v) => void load({ pageSize: Number(v), page: 1 })}
          >
            <SelectTrigger size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading || data.page <= 1}
            onClick={() => void load({ page: data.page - 1 })}
          >
            Prev
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading || data.page >= totalPages}
            onClick={() => void load({ page: data.page + 1 })}
          >
            Next
          </Button>
        </div>
      </div>
    </main>
  );
}
