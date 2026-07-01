"use client";

import * as React from "react";
import Link from "@/components/nav/ProgressLink";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PermissionLevel, PermissionModule, UserRole } from "@prisma/client";

import {
  clearPermissionOverride,
  deleteUser,
  resetUserPassword,
  setPermissionOverride,
  setUserActive,
  updateUser,
  type UserDetail,
} from "@/actions/users";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const OPERATIONAL_MODULES: PermissionModule[] = [
  PermissionModule.REPORTS,
  PermissionModule.RECONCILIATION,
  PermissionModule.SETTLEMENTS,
  PermissionModule.PAYMENTS,
  PermissionModule.DATA_EXPLORER,
];

const ADMIN_ONLY_MODULES: PermissionModule[] = [
  PermissionModule.USERS,
  PermissionModule.AUDIT,
  PermissionModule.SETTINGS,
];

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString();
}

function levelBadgeClass(level: PermissionLevel): string {
  switch (level) {
    case PermissionLevel.FULL:
      return "border-violet-200 bg-violet-50 text-violet-900";
    case PermissionLevel.EDIT:
      return "border-blue-200 bg-blue-50 text-blue-900";
    case PermissionLevel.VIEW:
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-500";
  }
}

export function UserDetailClient({ user }: { user: UserDetail }) {
  const router = useRouter();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/settings/users"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← All users
          </Link>
          <h2 className="mt-1 text-base font-semibold text-foreground">
            {user.name}
          </h2>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <DeleteUserButton id={user.id} onDone={() => router.push("/settings/users")} />
      </div>

      <IdentitySection user={user} />
      <DetailsSection user={user} />
      <StatusSection user={user} />
      <PasswordSection user={user} />
      <PermissionsSection user={user} />
    </main>
  );
}

/* ============================================================
 * Details (admin-managed profile / contact)
 * ============================================================ */

function toDateInputValue(d: Date | null): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function DetailsSection({ user }: { user: UserDetail }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  useTrackPending(pending);
  const [designation, setDesignation] = React.useState(user.designation ?? "");
  const [department, setDepartment] = React.useState(user.department ?? "");
  const [employeeId, setEmployeeId] = React.useState(user.employeeId ?? "");
  const [mobile, setMobile] = React.useState(user.mobile ?? "");
  const [dateJoined, setDateJoined] = React.useState(
    toDateInputValue(user.dateJoined),
  );
  const [address, setAddress] = React.useState(user.address ?? "");

  const dirty =
    designation !== (user.designation ?? "") ||
    department !== (user.department ?? "") ||
    employeeId !== (user.employeeId ?? "") ||
    mobile !== (user.mobile ?? "") ||
    dateJoined !== toDateInputValue(user.dateJoined) ||
    address !== (user.address ?? "");

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await updateUser(user.id, {
      designation: designation.trim() === "" ? null : designation.trim(),
      department: department.trim() === "" ? null : department.trim(),
      employeeId: employeeId.trim() === "" ? null : employeeId.trim(),
      mobile: mobile.trim() === "" ? null : mobile.trim(),
      dateJoined: dateJoined === "" ? null : dateJoined,
      address: address.trim() === "" ? null : address.trim(),
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Details saved.");
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <h3 className="text-sm font-semibold text-foreground">Details</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Admin-managed profile and contact information. All fields are optional.
      </p>
      <form onSubmit={onSave} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="u-designation">Designation</Label>
          <Input
            id="u-designation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            maxLength={120}
            placeholder="e.g. Operations Analyst"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-department">Department</Label>
          <Input
            id="u-department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            maxLength={120}
            placeholder="e.g. Reconciliation"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-employee-id">Employee ID</Label>
          <Input
            id="u-employee-id"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            maxLength={40}
            placeholder="Unique when provided"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-mobile">Mobile</Label>
          <Input
            id="u-mobile"
            type="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            maxLength={40}
            placeholder="+1 555 123 4567"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-date-joined">Date joined</Label>
          <Input
            id="u-date-joined"
            type="date"
            value={dateJoined}
            onChange={(e) => setDateJoined(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="u-address">Address</Label>
          <Textarea
            id="u-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Street, city, state, postal code"
          />
        </div>
        <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
          <Button type="submit" size="sm" disabled={!dirty || pending}>
            {pending ? "Saving…" : "Save details"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/* ============================================================
 * Identity
 * ============================================================ */

function IdentitySection({ user }: { user: UserDetail }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  useTrackPending(pending);
  const [name, setName] = React.useState(user.name);
  const [email, setEmail] = React.useState(user.email);
  const [role, setRole] = React.useState<UserRole>(user.role);

  const dirty = name !== user.name || email !== user.email || role !== user.role;

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await updateUser(user.id, { name, email, role });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("User updated.");
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <h3 className="text-sm font-semibold text-foreground">Identity</h3>
      <form onSubmit={onSave} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="u-name">Name</Label>
          <Input
            id="u-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-email">Email</Label>
          <Input
            id="u-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-role">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
            <SelectTrigger id="u-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UserRole.VIEWER}>VIEWER</SelectItem>
              <SelectItem value={UserRole.VENDOR}>VENDOR</SelectItem>
              <SelectItem value={UserRole.ADMIN}>ADMIN</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
          <Button type="submit" size="sm" disabled={!dirty || pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/* ============================================================
 * Status (suspend / reactivate)
 * ============================================================ */

function StatusSection({ user }: { user: UserDetail }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  useTrackPending(pending);

  async function toggle() {
    const res = await setUserActive(user.id, { active: !user.isActive });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(user.isActive ? "User suspended." : "User reactivated.");
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Status</h3>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {user.isActive ? (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 font-normal text-emerald-800">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="border-red-200 bg-red-50 font-normal text-red-800">
                  Suspended
                </Badge>
              )}
            </span>
            <span>Last login: {fmtDate(user.lastLoginAt)}</span>
            <span>Created: {fmtDate(user.createdAt)}</span>
          </div>
        </div>
        <Button
          type="button"
          variant={user.isActive ? "outline" : "default"}
          size="sm"
          disabled={pending}
          onClick={() => void toggle()}
        >
          {user.isActive ? "Suspend" : "Reactivate"}
        </Button>
      </div>
    </section>
  );
}

/* ============================================================
 * Password reset
 * ============================================================ */

function PasswordSection({ user }: { user: UserDetail }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  useTrackPending(pending);
  const [pw, setPw] = React.useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await resetUserPassword(user.id, { newTempPassword: pw });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Password reset. User will be forced to change on next login.");
    setPw("");
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Password</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Reset to a temporary password. The user will be required to choose
            a new one on next login.
            {user.mustChangePassword ? (
              <span className="ml-2 text-amber-700">
                (currently pending password change)
              </span>
            ) : null}
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setPw("");
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              Reset password
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                The user will need to change this on next login.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rp-pw">New temporary password</Label>
                <Input
                  id="rp-pw"
                  type="text"
                  autoComplete="off"
                  required
                  minLength={8}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending ? "Resetting…" : "Reset"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}

/* ============================================================
 * Delete (soft)
 * ============================================================ */

function DeleteUserButton({
  id,
  onDone,
}: {
  id: string;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  useTrackPending(pending);

  async function onConfirm() {
    const res = await deleteUser(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("User deleted.");
    setOpen(false);
    startTransition(onDone);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="text-red-600 hover:bg-red-50">
          Delete user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user?</DialogTitle>
          <DialogDescription>
            Soft-delete the account. They will no longer be able to log in. This
            action requires FULL permission on USERS and is recorded in the
            audit log.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={pending}
            onClick={() => void onConfirm()}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * Permission matrix
 * ============================================================ */

function PermissionsSection({ user }: { user: UserDetail }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  useTrackPending(pending);

  const byModule = React.useMemo(() => {
    const m = new Map<PermissionModule, { level: PermissionLevel; source: "override" | "inherited" }>();
    for (const p of user.permissions) m.set(p.module, { level: p.level, source: p.source });
    return m;
  }, [user.permissions]);

  async function setOverride(module: PermissionModule, level: PermissionLevel) {
    const res = await setPermissionOverride(user.id, { module, level });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Override set: ${module} = ${level}.`);
    startTransition(() => router.refresh());
  }

  async function clearOverride(module: PermissionModule) {
    const res = await clearPermissionOverride(user.id, { module });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Reset to role default on ${module}.`);
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <h3 className="text-sm font-semibold text-foreground">Permissions</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Effective level per module. Overrides apply only to operational modules;
        admin-only modules stay fixed to the role default.
      </p>

      <div className="mt-4 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Effective level</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Controls</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {OPERATIONAL_MODULES.map((mod) => {
              const cell = byModule.get(mod);
              if (!cell) return null;
              return (
                <TableRow key={mod}>
                  <TableCell className="font-medium">{mod}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`font-normal ${levelBadgeClass(cell.level)}`}>
                      {cell.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {cell.source === "override" ? (
                      <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800">
                        Override
                      </span>
                    ) : (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                        Inherited
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Select
                        value={cell.level}
                        onValueChange={(v) =>
                          void setOverride(mod, v as PermissionLevel)
                        }
                        disabled={pending}
                      >
                        <SelectTrigger size="sm" className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={PermissionLevel.NONE}>NONE</SelectItem>
                          <SelectItem value={PermissionLevel.VIEW}>VIEW</SelectItem>
                          <SelectItem value={PermissionLevel.EDIT}>EDIT</SelectItem>
                          <SelectItem value={PermissionLevel.FULL}>FULL</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={cell.source !== "override" || pending}
                        onClick={() => void clearOverride(mod)}
                      >
                        Reset
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {ADMIN_ONLY_MODULES.map((mod) => {
              const cell = byModule.get(mod);
              if (!cell) return null;
              return (
                <TableRow key={mod} className="opacity-80">
                  <TableCell className="font-medium">{mod}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`font-normal ${levelBadgeClass(cell.level)}`}>
                      {cell.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                      Role default
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    Admin-only module — not override-eligible
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
