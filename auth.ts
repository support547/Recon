import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { controlPrisma, UserRole } from "@/lib/control-prisma";
import { AuditAction, recordAudit } from "@/lib/auth/audit";

type AuthRole = `${UserRole}`;

function ipFromRequest(req: Request | undefined): string | null {
  if (!req) return null;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  return real ? real.trim() : null;
}

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: AuthRole;
      companyId: string;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: AuthRole;
    companyId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Cookie hard-cap of 1 hour. The client-side idle watcher enforces the
  // 10-minute inactivity logout while a tab is open; this cap kicks in when
  // the browser was closed/asleep so a stale cookie cannot resurrect a stale
  // session.
  session: { strategy: "jwt", maxAge: 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const ipAddress = ipFromRequest(request);

        const user = await controlPrisma.user.findUnique({
          where: { email },
        });
        if (!user || !user.isActive) {
          // Only audit failed logins for known emails so the log doesn't
          // become a user-enumeration oracle, and to keep noise down.
          if (user) {
            await recordAudit({
              action: AuditAction.LOGIN_FAILED,
              actorId: null,
              actorEmail: email,
              targetType: "User",
              targetId: user.id,
              targetEmail: user.email,
              summary: `Login rejected: account suspended (${email}).`,
              ipAddress,
              databaseUrl: null,
            });
          }
          return null;
        }

        const company = await controlPrisma.company.findUnique({
          where: { id: user.companyId },
          select: { databaseUrl: true },
        });
        if (!company) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          await recordAudit({
            action: AuditAction.LOGIN_FAILED,
            actorId: null,
            actorEmail: email,
            targetType: "User",
            targetId: user.id,
            targetEmail: user.email,
            summary: `Login rejected: invalid password (${email}).`,
            ipAddress,
            databaseUrl: company.databaseUrl,
          });
          return null;
        }

        controlPrisma.user
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })
          .catch(() => {});

        await recordAudit({
          action: AuditAction.LOGIN_SUCCESS,
          actorId: user.id,
          actorEmail: user.email,
          targetType: "User",
          targetId: user.id,
          targetEmail: user.email,
          summary: `Login success for ${user.email}.`,
          ipAddress,
          databaseUrl: company.databaseUrl,
        });

        return {
          id: user.id,
          name: user.name ?? user.email,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id: string; role?: AuthRole; companyId?: string };
        token.id = u.id;
        token.role = u.role;
        token.companyId = u.companyId;
        return token;
      }

      // Subsequent calls (no fresh `user`): the cookie is being restored.
      // Re-validate the user still exists and is active in the control DB; if
      // not, return null to invalidate the session and clear the cookie. Why:
      // a stale `token.id` from a previous login (after a control-DB reset,
      // hard delete, or suspension) would otherwise 500 every downstream
      // getTenantPrisma() call instead of bouncing the user back to /login.
      if (token?.id) {
        try {
          const dbUser = await controlPrisma.user.findUnique({
            where: { id: token.id },
            select: { isActive: true, role: true, companyId: true },
          });
          if (!dbUser || !dbUser.isActive) return null;
          // Keep role/companyId fresh so admin changes propagate on next request.
          token.role = dbUser.role;
          token.companyId = dbUser.companyId;
        } catch {
          // Transient control-DB error: keep the token instead of logging
          // every user out on a single blip.
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) session.user.id = token.id;
      if (token?.role) session.user.role = token.role;
      if (token?.companyId) session.user.companyId = token.companyId;
      return session;
    },
  },
});
