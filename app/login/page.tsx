import * as React from "react";

import { BootstrapForm } from "@/components/auth/bootstrap-form";
import { LoginForm } from "@/components/auth/login-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let userCount = 0;
  try {
    userCount = await prisma.user.count();
  } catch {
    // DB unreachable — fall through to login form; signIn will surface error.
  }

  const bootstrapping = userCount === 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">
            {bootstrapping
              ? "Create the first admin"
              : "Sign in to FBA Reconciliation"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {bootstrapping
              ? "No accounts exist yet. The first user is created with the ADMIN role."
              : "Use your email and password to continue."}
          </p>
        </div>

        <React.Suspense fallback={null}>
          {bootstrapping ? <BootstrapForm /> : <LoginForm />}
        </React.Suspense>
      </div>
    </main>
  );
}
