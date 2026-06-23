// Prisma 7 moved datasource URLs out of schema.prisma. This config powers
// `prisma migrate` / `prisma generate` for the control DB schema. Tenant
// migrations use the top-level prisma.config.ts.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "schema.prisma",
  migrations: {
    path: "migrations",
  },
  datasource: {
    url: process.env["CONTROL_DATABASE_URL"],
  },
});
