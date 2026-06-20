"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserRole } from "@prisma/client";

import {
  changeMyPassword,
  updateMyProfile,
  type MyProfile,
} from "@/actions/profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

function fmtDateOnly(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString();
}

export function ProfileClient({ profile }: { profile: MyProfile }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div>
        <h2 className="text-base font-semibold text-foreground">My Profile</h2>
        <p className="text-xs text-muted-foreground">
          Manage your own account. Role and permissions are set by an
          administrator and shown here read-only.
        </p>
      </div>

      <DetailsSection profile={profile} />
      <AdminManagedDetailsSection profile={profile} />
      <ReadOnlySection profile={profile} />
      <PasswordSection />
    </main>
  );
}

function DetailsSection({ profile }: { profile: MyProfile }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState(profile.name);

  const dirty = name.trim() !== profile.name;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await updateMyProfile({ name: name.trim() });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Profile updated.");
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <h3 className="text-sm font-semibold text-foreground">Account details</h3>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="me-name">Display name</Label>
          <Input
            id="me-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="me-email">Email</Label>
          <Input id="me-email" value={profile.email} disabled />
          <p className="text-[11px] text-muted-foreground">
            Email is managed by an administrator.
          </p>
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm" disabled={!dirty || pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ReadOnlySection({ profile }: { profile: MyProfile }) {
  return (
    <section className="rounded-lg border bg-white p-4">
      <h3 className="text-sm font-semibold text-foreground">
        Role & status (read-only)
      </h3>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Only an administrator can change these. Reach out to your admin if you
        need different access.
      </p>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Role
          </dt>
          <dd className="mt-1">
            <Badge variant="outline" className={`font-normal ${roleBadgeClass(profile.role)}`}>
              {profile.role}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </dt>
          <dd className="mt-1">
            {profile.isActive ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 font-normal text-emerald-800">
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="border-red-200 bg-red-50 font-normal text-red-800">
                Suspended
              </Badge>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Last login
          </dt>
          <dd className="mt-1 text-muted-foreground">{fmtDate(profile.lastLoginAt)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Account created
          </dt>
          <dd className="mt-1 text-muted-foreground">{fmtDate(profile.createdAt)}</dd>
        </div>
      </dl>
    </section>
  );
}

function AdminManagedDetailsSection({ profile }: { profile: MyProfile }) {
  const items: { label: string; value: string }[] = [
    { label: "Designation", value: profile.designation ?? "—" },
    { label: "Department", value: profile.department ?? "—" },
    { label: "Employee ID", value: profile.employeeId ?? "—" },
    { label: "Mobile", value: profile.mobile ?? "—" },
    { label: "Date joined", value: fmtDateOnly(profile.dateJoined) },
    { label: "Address", value: profile.address ?? "—" },
  ];
  return (
    <section className="rounded-lg border bg-white p-4">
      <h3 className="text-sm font-semibold text-foreground">
        Profile details (admin-managed)
      </h3>
      <p className="mt-1 text-[11px] text-muted-foreground">
        These are set by an administrator. Contact your admin to request a
        change.
      </p>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.label}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {it.label}
            </dt>
            <dd className="mt-1 whitespace-pre-line text-foreground">
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PasswordSection() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    const res = await changeMyPassword({ current, next });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Password changed.");
    setCurrent("");
    setNext("");
    setConfirm("");
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <h3 className="text-sm font-semibold text-foreground">Change password</h3>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="cp-current">Current password</Label>
          <Input
            id="cp-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp-next">New password</Label>
          <Input
            id="cp-next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp-confirm">Confirm new password</Label>
          <Input
            id="cp-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </section>
  );
}
