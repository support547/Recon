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
