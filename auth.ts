import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { AuditAction } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/auth/audit";

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
      role: "ADMIN" | "VENDOR" | "VIEWER";
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: "ADMIN" | "VENDOR" | "VIEWER";
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
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

        const user = await prisma.user.findUnique({
          where: { email },
        });
        if (!user || !user.isActive || user.deletedAt) {
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
              summary: !user.isActive
                ? `Login rejected: account suspended (${email}).`
                : `Login rejected: account removed (${email}).`,
              ipAddress,
            });
          }
          return null;
        }

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
          });
          return null;
        }

        // Update last login asynchronously; don't block auth.
        prisma.user
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })
          .catch(() => {
            /* ignore */
          });

        await recordAudit({
          action: AuditAction.LOGIN_SUCCESS,
          actorId: user.id,
          actorEmail: user.email,
          targetType: "User",
          targetId: user.id,
          targetEmail: user.email,
          summary: `Login success for ${user.email}.`,
          ipAddress,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: "ADMIN" | "VENDOR" | "VIEWER" }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) session.user.id = token.id;
      if (token?.role) session.user.role = token.role;
      return session;
    },
  },
});
