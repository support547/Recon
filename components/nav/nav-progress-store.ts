"use client";

import * as React from "react";

let count = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function increment() {
  count += 1;
  emit();
}

export function decrement() {
  count = Math.max(0, count - 1);
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return count;
}

function getServerSnapshot() {
  return 0;
}

export function useActiveCount() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Mirror any boolean into the global counter. Any component that already has
// a `loading` / `pending` / `submitting` state can call this hook to surface
// its work in the top progress bar without owning its own fetch tracking.
export function useTrackPending(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    increment();
    return () => {
      decrement();
    };
  }, [active]);
}
