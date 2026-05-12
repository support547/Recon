"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createUser, signInWithCredentials } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BootstrapForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      password: String(fd.get("password") ?? ""),
      role: "ADMIN" as const,
    };
    const createRes = await createUser(payload);
    if (!createRes.ok) {
      toast.error(createRes.error);
      return;
    }
    toast.success("Admin account created — signing you in…");

    const signInFd = new FormData();
    signInFd.set("email", payload.email);
    signInFd.set("password", payload.password);
    const signRes = await signInWithCredentials(signInFd);
    if (!signRes.ok) {
      toast.error(signRes.error);
      return;
    }
    startTransition(() => {
      router.push("/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="b-name">Full name</Label>
        <Input id="b-name" name="name" required placeholder="Ada Lovelace" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="b-email">Email</Label>
        <Input
          id="b-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="b-password">Password</Label>
        <Input
          id="b-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create admin & sign in"}
      </Button>
    </form>
  );
}
