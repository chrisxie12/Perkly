"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, BellOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removePushSubscription, savePushSubscription } from "../actions";

type State = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on" | "busy";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac/.test(ua)
          ? "Mac"
          : "This device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "browser";
  return `${os}, ${browser}`;
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

async function getRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/**
 * Turns phone notifications on or off for this device. On iPhone they only
 * work once Perqly is added to the Home Screen (iOS 16.4 and later).
 */
export function PushToggle({ vapidPublicKey, compact = false }: { vapidPublicKey: string | null; compact?: boolean }) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let next: State;
      if (!supported) next = isIos() && !isStandalone() ? "needs-install" : "unsupported";
      else if (Notification.permission === "denied") next = "blocked";
      else {
        const reg = await getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        next = sub ? "on" : "off";
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  const turnOn = async () => {
    if (!vapidPublicKey) return;
    setMessage(null);
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await getRegistration();
      if (!reg) {
        setState("off");
        setMessage("Perqly's app files are still loading. Try again in a moment.");
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const saved = await savePushSubscription(sub.toJSON(), deviceLabel());
      if (!saved) {
        await sub.unsubscribe();
        setState("off");
        setMessage("Couldn't turn notifications on. Check your connection and try again.");
        return;
      }
      setState("on");
    } catch {
      setState("off");
      setMessage("Couldn't turn notifications on. Check your connection and try again.");
    }
  };

  const turnOff = async () => {
    setMessage(null);
    setState("busy");
    try {
      const reg = await getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
      setMessage("Couldn't turn notifications off. Try again.");
    }
  };

  if (!vapidPublicKey) {
    return compact ? null : (
      <p className="text-[0.9375rem] text-ink-700">
        Phone notifications aren&apos;t switched on for Perqly yet. You&apos;ll still see everything here.
      </p>
    );
  }
  if (compact && (state === "on" || state === "checking" || state === "unsupported")) return null;

  return (
    <div className={compact ? "rounded-2xl bg-blue-50 p-4" : ""}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-blue-700 ring-1 ring-blue-100">
          {state === "on" ? (
            <BellRing className="size-5" aria-hidden />
          ) : state === "blocked" ? (
            <BellOff className="size-5" aria-hidden />
          ) : (
            <Smartphone className="size-5" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900">{state === "on" ? "Phone notifications are on" : "Get notifications on this phone"}</p>
          <p className="mt-0.5 text-[0.9375rem] text-ink-700">
            {state === "needs-install"
              ? "On iPhone, add Perqly to your Home Screen first: tap Share, then Add to Home Screen. Open Perqly from there and come back here."
              : state === "unsupported"
                ? "This browser can't show notifications. Try Chrome on Android, or Perqly from your iPhone's Home Screen."
                : state === "blocked"
                  ? "Notifications are blocked for Perqly. Allow them in your browser or phone settings, then come back here."
                  : state === "on"
                    ? "You'll get alerts on this device even when Perqly is closed."
                    : "Know straight away when you're verified, a saved shop posts a deal, or a redemption goes through."}
          </p>
          {(state === "off" || state === "on" || state === "busy") && (
            <div className="mt-3">
              {state === "on" ? (
                <Button type="button" variant="secondary" size="sm" onClick={turnOff}>
                  Turn off on this device
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={turnOn} disabled={state === "busy"}>
                  {state === "busy" ? "Working…" : "Turn on notifications"}
                </Button>
              )}
            </div>
          )}
          <p role="status" className="mt-2 text-sm font-medium text-ink-700 empty:hidden">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
