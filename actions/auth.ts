"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth, signIn, signOut } from "@/auth";
import {
  controlPrisma,
  UserRole,
} from "@/lib/control-prisma";
import { getTenantPrismaByUrl } from "@/lib/prisma";

export type AuthMutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const SignInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

const CreateUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(200),
  role: z.nativeEnum(UserRole).default(UserRole.VIEWER),
});

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password required."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters.")
      .max(200),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must differ from current.",
    path: ["newPassword"],
  });

const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

/** Auth-gate for every mutating server action.
 *  Returns the control-DB identity of the caller plus the resolved tenant
 *  databaseUrl, so callers can pass it straight to getTenantPrismaByUrl when
 *  they want to avoid the session round-trip in getTenantPrisma. */
export async function requireAuth(): Promise<{
  id: string;
  email: string;
  role: UserRole;
  name: string;
  companyId: string;
  databaseUrl: string;
}> {
  if (!AUTH_ENABLED) {
    const devUrl = process.env.DEV_TENANT_DATABASE_URL ?? "";
    return {
      id: "system",
      email: "system@local",
      role: UserRole.ADMIN,
      name: "System",
      companyId: "system",
      databaseUrl: devUrl,
    };
  }
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized: please sign in.");
  }
  const user = await controlPrisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
      isActive: true,
      company: { select: { databaseUrl: true } },
    },
  });
  if (!user || !user.isActive) {
    throw new Error("Unauthorized: user not found or inactive.");
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name ?? user.email,
    companyId: user.companyId,
    databaseUrl: user.company.databaseUrl,
  };
}

export async function requireRole(
  ...roles: UserRole[]
): Promise<Awaited<ReturnType<typeof requireAuth>>> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new Error("Forbidden: insufficient role.");
  }
  return user;
}

export async function signInWithCredentials(
  formData: FormData,
): Promise<AuthMutationResult<{ callbackUrl: string }>> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }

  const callbackUrl =
    typeof formData.get("callbackUrl") === "string"
      ? String(formData.get("callbackUrl"))
      : "/";

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    return { ok: true, data: { callbackUrl } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sign-in failed.";
    if (msg.toLowerCase().includes("credentialssignin")) {
      return { ok: false, error: "Invalid email or password." };
    }
    return { ok: false, error: msg };
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirect: false });
  redirect("/login");
}

/**
 * Create a user inside the caller's tenant. Dual-write: control DB holds the
 * auth credentials; the tenant DB gets a matching User row so FK-bearing
 * tables (audit_logs.actor, user_permission_overrides.user) resolve.
 */
export async function createUser(
  raw: unknown,
): Promise<AuthMutationResult<{ id: string; role: UserRole }>> {
  const parsed = CreateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const v = parsed.data;

  let caller;
  try {
    caller = await requireRole(UserRole.ADMIN);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden.";
    return { ok: false, error: msg };
  }

  const existing = await controlPrisma.user.findUnique({
    where: { email: v.email },
  });
  if (existing) return { ok: false, error: "Email already registered." };

  const passwordHash = await bcrypt.hash(v.password, 12);
  const tenantPrisma = getTenantPrismaByUrl(caller.databaseUrl);

  try {
    const user = await controlPrisma.user.create({
      data: {
        name: v.name,
        email: v.email,
        passwordHash,
        role: v.role,
        companyId: caller.companyId,
      },
      select: { id: true, role: true },
    });
    // Mirror into tenant DB so audit/permission FKs resolve.
    await tenantPrisma.user.create({
      data: {
        id: user.id,
        name: v.name,
        email: v.email,
        passwordHash,
        role: v.role,
      },
    });
    revalidatePath("/");
    return { ok: true, data: user };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create user.";
    return { ok: false, error: msg };
  }
}

export async function changePassword(
  raw: unknown,
): Promise<AuthMutationResult> {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unauthorized.",
    };
  }

  const parsed = ChangePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }

  const dbUser = await controlPrisma.user.findUnique({
    where: { id: user.id },
  });
  if (!dbUser) return { ok: false, error: "User not found." };

  const ok = await bcrypt.compare(
    parsed.data.currentPassword,
    dbUser.passwordHash,
  );
  if (!ok) return { ok: false, error: "Current password incorrect." };

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  try {
    await controlPrisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not change password.";
    return { ok: false, error: msg };
  }
}
