const required = ["DATABASE_URL"] as const;
const optional = ["AUTH_ENABLED", "NEXTAUTH_SECRET", "AUTH_SECRET"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(
      `[env] Missing required environment variable: ${key}. Set it in .env before starting the app.`,
    );
  }
}

if (process.env.AUTH_ENABLED === "true") {
  const hasSecret = Boolean(
    process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  );
  if (!hasSecret) {
    throw new Error(
      "[env] AUTH_ENABLED=true requires NEXTAUTH_SECRET or AUTH_SECRET to be set.",
    );
  }
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  AUTH_ENABLED: process.env.AUTH_ENABLED ?? "false",
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  AUTH_SECRET: process.env.AUTH_SECRET,
} as const;

export type AppEnv = typeof env;

void optional;
