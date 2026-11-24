"use client";

import * as React from "react";
import { useSerwist } from "@serwist/turbopack/react";

/** How long the app must sit in the background before a waiting update is put in. */
const BACKGROUND_MS = 20_000;

/**
 * New versions of Perqly install quietly, the way Snapchat and WhatsApp update: when a new
 * version is waiting, it's put in once the app has been in the background for a little while
 * (switched away from, or the screen off), so you come back to the new version and nothing
 * you were doing on screen is interrupted. Nothing is shown.
 */
export function UpdatePrompt() {
  const { serwist } = useSerwist();
  // Only reload when we put an update in. On a first visit the service worker also takes
  // control, and that must not reload the page.
  const updateRequested = React.useRef(false);

  React.useEffect(() => {
    if (!serwist) return;
    let waiting = false;
    let timer: number | undefined;
    const apply = () => {
      if (!waiting || updateRequested.current || document.visibilityState === "visible") return;
      updateRequested.current = true;
      serwist.messageSkipWaiting();
    };
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "hidden" && waiting) timer = window.setTimeout(apply, BACKGROUND_MS);
    };
    const onWaiting = () => {
      waiting = true;
      onVisibility();
    };
    const onControlling = () => {
      if (updateRequested.current) window.location.reload();
    };
    serwist.addEventListener("waiting", onWaiting);
    serwist.addEventListener("controlling", onControlling);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      serwist.removeEventListener("waiting", onWaiting);
      serwist.removeEventListener("controlling", onControlling);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [serwist]);

  return null;
}
