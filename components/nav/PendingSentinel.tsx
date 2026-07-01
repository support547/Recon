"use client";

import { useTrackPending } from "./nav-progress-store";

// Renders nothing. While mounted, increments the global nav-progress counter
// via `useTrackPending(true)` so the top bar stays visible for as long as the
// surrounding skeleton is on screen (RSC streaming, Suspense fallbacks, and
// route-level loading.tsx all keep their skeleton mounted until real content
// commits — mounting a sentinel inside each skeleton wires that lifecycle
// straight into the bar).
export function PendingSentinel() {
  useTrackPending(true);
  return null;
}
