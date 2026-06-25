"use client";

import * as React from "react";
import { toast } from "sonner";

import { signOutAction } from "@/actions/auth";

const IDLE_LIMIT_MS = 10 * 60 * 1000;
const WARN_AT_MS = 9 * 60 * 1000;
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "click",
  "wheel",
];

export function IdleLogout({ enabled }: { enabled: boolean }) {
  React.useEffect(() => {
    if (!enabled) return;

    let warnTimer: ReturnType<typeof setTimeout> | undefined;
    let logoutTimer: ReturnType<typeof setTimeout> | undefined;
    let signedOut = false;

    const fireSignOut = () => {
      if (signedOut) return;
      signedOut = true;
      toast.message("Signed out — inactive for 10 minutes.");
      void signOutAction().catch(() => {
        window.location.href = "/login";
      });
    };

    const reset = () => {
      if (signedOut) return;
      if (warnTimer) clearTimeout(warnTimer);
      if (logoutTimer) clearTimeout(logoutTimer);
      warnTimer = setTimeout(() => {
        toast.warning(
          "You will be signed out in 1 minute due to inactivity.",
          { duration: 60_000 },
        );
      }, WARN_AT_MS);
      logoutTimer = setTimeout(fireSignOut, IDLE_LIMIT_MS);
    };

    reset();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, reset, { passive: true });
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (warnTimer) clearTimeout(warnTimer);
      if (logoutTimer) clearTimeout(logoutTimer);
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, reset);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return null;
}
