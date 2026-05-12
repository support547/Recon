import { NextResponse } from "next/server";

import { auth } from "@/auth";

// Next 16 replaces middleware.ts with proxy.ts.
// Exported function must be named `proxy` (or be the default export).
//
// AUTH is disabled by default while the ERP is being built. To turn it on,
// set AUTH_ENABLED=true in `.env`.
const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

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
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Match everything except static assets / next internals / favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)"],
};
