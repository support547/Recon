"use client";

import * as React from "react";
import Link from "@/components/nav/ProgressLink";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserRole } from "@prisma/client";

import { createUser, type UserListRow } from "@/actions/users";
import { useTrackPending } from "@/components/nav/nav-progress-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

function roleBadgeClass(role: UserRole): string {
  switch (role) {
    case UserRole.ADMIN:
      return "border-violet-200 bg-violet-50 text-violet-900";
    case UserRole.VENDOR:
      return "border-blue-200 bg-blue-50 text-blue-900";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString();
}

export function UsersListClient({ users }: { users: UserListRow[] }) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Users</h2>
          <p className="text-xs text-muted-foreground">
            Manage accounts, roles, and permissions.
          </p>
        </div>
        <CreateUserDialog />
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`font-normal ${roleBadgeClass(u.role)}`}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.isActive ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 font-normal text-emerald-800">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-red-200 bg-red-50 font-normal text-red-800">
                        Suspended
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtDate(u.lastLoginAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/settings/users/${u.id}`}>
                      <Button variant="outline" size="sm">
                        Manage
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}

function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  useTrackPending(pending);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<UserRole>(UserRole.VIEWER);
  const [tempPassword, setTempPassword] = React.useState("");

  function reset() {
    setName("");
    setEmail("");
    setRole(UserRole.VIEWER);
    setTempPassword("");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await createUser({ name, email, role, tempPassword });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("User created.");
    reset();
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Create user</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            Only the basics are required here — fill in additional profile
            details (designation, mobile, etc.) after creation on the user
            page. The user will be required to change their password on first
            login.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="cu-name">Full name</Label>
            <Input
              id="cu-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-email">Email</Label>
            <Input
              id="cu-email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger id="cu-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UserRole.VIEWER}>VIEWER</SelectItem>
                <SelectItem value={UserRole.VENDOR}>VENDOR</SelectItem>
                <SelectItem value={UserRole.ADMIN}>ADMIN</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-pw">Temporary password</Label>
            <Input
              id="cu-pw"
              type="text"
              autoComplete="off"
              required
              minLength={8}
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
