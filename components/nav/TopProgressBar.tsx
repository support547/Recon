"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { useActiveCount } from "./nav-progress-store";

// Indeterminate bar — pure CSS, no deps. CSS transition handles the 200ms
// fade-out when the last pending Link resolves; no setState needed.
export function TopProgressBar() {
  const active = useActiveCount();
  const isActive = active > 0;

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
