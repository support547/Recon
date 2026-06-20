/**
 * Idempotent first-admin seed.
 *
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD from the environment and upserts a single
 * ADMIN user. Safe to re-run: if the admin already exists, the password is
 * left alone unless ADMIN_RESET_PASSWORD=true is set.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=changeme npm run db:seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "@prisma/client";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set.");
}
const adapter = new PrismaPg(url);
const prisma = new PrismaClient({ adapter });

async function main() {
  const rawEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!rawEmail || !password) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD env vars are required to seed the first admin.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const reset = process.env.ADMIN_RESET_PASSWORD === "true";

  const existing = await prisma.user.findUnique({ where: { email: rawEmail } });

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        name: "Administrator",
        email: rawEmail,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
      select: { id: true, email: true },
    });
    console.log(`[seed] Created ADMIN ${created.email} (${created.id}).`);
    return;
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      role: UserRole.ADMIN,
      isActive: true,
      deletedAt: null,
      ...(reset ? { passwordHash, mustChangePassword: false } : {}),
    },
  });
  console.log(
    `[seed] Updated existing user ${existing.email} -> ADMIN (active${
      reset ? ", password reset" : ""
    }).`,
  );
}

main()
  .catch((e) => {
    console.error("[seed] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
