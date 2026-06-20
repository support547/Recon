"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuditAction, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/auth/audit";
import {
  authzErrorToMutationResult,
  requireSession,
  type MutationResult,
} from "@/lib/auth/rbac";

/* ============================================================
 * Validation
 * ============================================================ */

const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
});

const ChangePasswordSchema = z
  .object({
    current: z.string().min(1, "Current password required."),
    next: z
      .string()
      .min(8, "New password must be at least 8 characters.")
      .max(200),
  })
  .refine((v) => v.current !== v.next, {
    message: "New password must differ from current.",
    path: ["next"],
  });

/* ============================================================
 * Self-service reads — ONLY the caller's own profile.
 * ============================================================ */

export type MyProfile = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  // Admin-managed details. Returned read-only — updateMyProfile cannot change.
  designation: string | null;
  mobile: string | null;
  dateJoined: Date | null;
  address: string | null;
  department: string | null;
  employeeId: string | null;
};

export async function getMyProfile(): Promise<MyProfile | null> {
  const session = await requireSession();
  const u = await prisma.user.findFirst({
    where: { id: session.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      designation: true,
      mobile: true,
      dateJoined: true,
      address: true,
      department: true,
      employeeId: true,
    },
  });
  return u;
}

/* ============================================================
 * Self-service mutations.
 *
 * SECURITY: these MUST refuse any attempt to change role, isActive,
 * permissions, or another user's record. The guard here is the boundary —
 * never trust the UI to hide privilege fields.
 *
 *  - Schemas (Zod .strict where used) restrict accepted fields, but the
 *    real defense is that only `name` / `current` / `next` are read from
 *    parsed.data and passed to Prisma. We never spread raw input into the
 *    update payload.
 *  - The Prisma update is always scoped to `where: { id: session.id }`.
 *    There is no `id` field on the input schemas — a malicious client
 *    cannot redirect the write to another user.
 * ============================================================ */

export async function updateMyProfile(
  raw: unknown,
): Promise<MutationResult> {
  let session;
  try {
    session = await requireSession();
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  const parsed = UpdateProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }

  const existing = await prisma.user.findFirst({
    where: { id: session.id, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  if (!existing) return { ok: false, error: "Account not found." };

  if (existing.name === parsed.data.name) return { ok: true };

  try {
    await prisma.user.update({
      where: { id: existing.id },
      // SECURITY: explicit field list — never spread parsed.data, never accept
      // role / isActive / permissions through self-service.
      data: { name: parsed.data.name },
    });

    await recordAudit({
      action: AuditAction.PROFILE_UPDATED,
      actorId: existing.id,
      actorEmail: existing.email,
      targetType: "User",
      targetId: existing.id,
      targetEmail: existing.email,
      summary: `Updated own display name.`,
      metadata: { before: { name: existing.name }, after: { name: parsed.data.name } },
    });

    revalidatePath("/profile");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update profile.";
    return { ok: false, error: msg };
  }
}

export async function changeMyPassword(
  raw: unknown,
): Promise<MutationResult> {
  let session;
  try {
    session = await requireSession();
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  const parsed = ChangePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }

  const dbUser = await prisma.user.findFirst({
    where: { id: session.id, deletedAt: null },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!dbUser) return { ok: false, error: "Account not found." };

  const ok = await bcrypt.compare(parsed.data.current, dbUser.passwordHash);
  if (!ok) return { ok: false, error: "Current password incorrect." };

  const newHash = await bcrypt.hash(parsed.data.next, 12);

  try {
    await prisma.user.update({
      where: { id: dbUser.id },
      // SECURITY: explicit field list. mustChangePassword cleared because the
      // user has now chosen their own password.
      data: { passwordHash: newHash, mustChangePassword: false },
    });

    await recordAudit({
      action: AuditAction.PROFILE_PASSWORD_CHANGED,
      actorId: dbUser.id,
      actorEmail: dbUser.email,
      targetType: "User",
      targetId: dbUser.id,
      targetEmail: dbUser.email,
      summary: `Changed own password.`,
    });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not change password.";
    return { ok: false, error: msg };
  }
}
