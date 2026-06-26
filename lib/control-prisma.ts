import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/control-prisma/generated";

export type { Company, User } from "@/lib/control-prisma/generated";
export { UserRole } from "@/lib/control-prisma/generated";

const globalForControl = globalThis as unknown as {
  controlPrisma: PrismaClient | undefined;
};

function createControlPrisma(): PrismaClient {
  const url = process.env.CONTROL_DATABASE_URL;
  if (!url) {
    throw new Error("CONTROL_DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const controlPrisma: PrismaClient =
  globalForControl.controlPrisma ?? createControlPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForControl.controlPrisma = controlPrisma;
}
