"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UserRole } from "@prisma/client";

import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

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

/** Used by every mutating server action to gate access.
 *
 *  While the ERP is being built (AUTH_ENABLED !== "true") this returns a stub
 *  system user so mutations succeed without a session. Flip AUTH_ENABLED=true
 *  in .env once the auth flow is reactivated.
 */
export async function requireAuth(): Promise<{
  id: string;
  email: string;
  role: UserRole;
  name: string;
}> {
  if (!AUTH_ENABLED) {
    return {
      id: "system",
      email: "system@local",
      role: UserRole.ADMIN,
      name: "System",
    };
  }
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized: please sign in.");
  }
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    role: session.user.role as UserRole,
    name: session.user.name ?? "",
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
 * Create a user. The very first user created in the system is automatically
 * promoted to ADMIN regardless of the requested role. Subsequent creations
 * require an authenticated ADMIN caller.
 */
export async function createUser(
  raw: unknown,
): Promise<AuthMutationResult<{ id: string; role: UserRole }>> {
  const parsed = CreateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const v = parsed.data;

  const existingCount = await prisma.user.count();
  if (existingCount > 0) {
    try {
      await requireRole(UserRole.ADMIN);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Forbidden.";
      return { ok: false, error: msg };
    }
  }

  const existing = await prisma.user.findUnique({
    where: { email: v.email },
  });
  if (existing) return { ok: false, error: "Email already registered." };

  const passwordHash = await bcrypt.hash(v.password, 12);
  const role = existingCount === 0 ? UserRole.ADMIN : v.role;

  try {
    const user = await prisma.user.create({
      data: {
        name: v.name,
        email: v.email,
        passwordHash,
        role,
      },
      select: { id: true, role: true },
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

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { ok: false, error: "User not found." };

  const ok = await bcrypt.compare(
    parsed.data.currentPassword,
    dbUser.passwordHash,
  );
  if (!ok) return { ok: false, error: "Current password incorrect." };

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not change password.";
    return { ok: false, error: msg };
  }
}
