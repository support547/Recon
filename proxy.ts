import { NextResponse } from "next/server";

import { auth } from "@/auth";

// Next 16 replaces middleware.ts with proxy.ts.
// Exported function must be named `proxy` (or be the default export).
//
// AUTH is disabled by default while the ERP is being built. To turn it on,
// set AUTH_ENABLED=true in `.env`.
const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

// Admin-only path prefixes. The proxy provides a COARSE redirect for
// non-admin browsers; the real security boundary is each server action's
// requireLevel/requireAdmin guard, which reads from the DB on every call.
const ADMIN_PATH_PREFIXES = ["/settings/users", "/settings/audit", "/admin"];

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const proxy = auth((req) => {
  if (!AUTH_ENABLED) return NextResponse.next();

  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Public paths
  const isAuthRoute = pathname.startsWith("/api/auth");
  const isLoginPage = pathname === "/login";

  if (isAuthRoute) return NextResponse.next();

  if (!isLoggedIn && !isLoginPage) {
    const callbackUrl = encodeURIComponent(pathname + req.nextUrl.search);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, req.url),
    );
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/upload", req.url));
  }

  // ADMIN route gate. Role lives in the JWT (req.auth.user.role) so we don't
  // need a DB read here. Role changes propagate to JWT on next sign-in; the
  // server-action guards do the DB read that catches mid-session changes.
  if (isLoggedIn && isAdminPath(pathname)) {
    const role = req.auth?.user?.role;
    if (role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  // Match everything except static assets / next internals / favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)"],
};
