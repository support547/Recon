"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { decrement, increment, useActiveCount } from "./nav-progress-store";

let fetchPatched = false;

// Patch global fetch once. Counts every fetch that takes >150ms — covers
// server-action RSC POSTs, client API calls, and anything else that fires
// after a route has already committed (e.g. useEffect data loads inside a
// client page). Short fetches (<150ms) skip the counter so the bar does not
// flicker on instant responses.
function installFetchInterceptor() {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof window.fetch>) => {
    let counted = false;
    const t = window.setTimeout(() => {
      counted = true;
      increment();
    }, 75);
    try {
      return await orig(...args);
    } finally {
      window.clearTimeout(t);
      if (counted) decrement();
    }
  };
}

// Indeterminate bar — pure CSS, no deps. CSS transition handles the 200ms
// fade-out when the last pending request resolves; no setState needed.
export function TopProgressBar() {
  const active = useActiveCount();
  const isActive = active > 0;

  React.useEffect(() => {
    installFetchInterceptor();
  }, []);

  return (
    <>
      <style>{`@keyframes navprogress-slide {
  0%   { transform: translateX(-100%) scaleX(0.4); }
  50%  { transform: translateX(0%)    scaleX(0.7); }
  100% { transform: translateX(100%)  scaleX(0.4); }
}`}</style>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity duration-200",
          isActive ? "opacity-100" : "opacity-0",
        )}
      >
        <div
          className="h-full w-full origin-left bg-indigo-600"
          style={{
            animation: isActive
              ? "navprogress-slide 1.1s ease-in-out infinite"
              : "none",
          }}
        />
      </div>
    </>
  );
}
