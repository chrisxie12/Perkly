"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { playSound } from "@/lib/sound";
import { NotificationToast, type ToastNotification } from "./notification-toast";

type RowLike = { id: string; title?: string; body?: string | null; link?: string | null; url?: string | null };

/**
 * The bell with its unread count, kept current without a refresh: Supabase
 * Realtime (row-level security applies, so only your own rows arrive), a
 * message from the service worker when a phone notification lands, and a
 * re-check whenever the app comes back to the foreground.
 */
export function LiveBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [pulse, setPulse] = useState(false);
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const shown = useRef(new Set<string>());
  const closeToast = useCallback(() => setToast(null), []);
  const pathname = usePathname();
  const router = useRouter();
  const onInbox = pathname === "/account/notifications";

  const recount = useCallback(async () => {
    try {
      const { data } = await createClient().rpc("unread_notification_count");
      if (typeof data === "number") setUnread(data);
    } catch {
      // Offline or no Supabase here: keep the last count.
    }
  }, []);

  /** Pop-up banner and chime, once per notification, unless you're already looking at what it's about. */
  const pending = useRef<{ row: RowLike; at: number } | null>(null);
  const announce = useCallback((n: RowLike) => {
    if (!n?.id || shown.current.has(n.id)) return;
    // In the background: keep the latest and show it when the app comes back.
    if (document.visibilityState !== "visible") {
      pending.current = { row: n, at: Date.now() };
      return;
    }
    shown.current.add(n.id);
    const target = (n.link ?? n.url ?? "").split("?")[0];
    if (target && target === window.location.pathname) return;
    playSound("notify");
    setToast({ id: n.id, title: n.title ?? "Perqly", body: n.body ?? null, hasLink: Boolean(n.link ?? n.url) });
  }, []);

  // A fresh server render (navigation, refresh) brings the true count.
  const [seenInitial, setSeenInitial] = useState(initialUnread);
  if (seenInitial !== initialUnread) {
    setSeenInitial(initialUnread);
    setUnread(initialUnread);
  }

  useEffect(() => {
    let cleanup = () => {};
    try {
      const supabase = createClient();
      const channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            setUnread((n) => n + 1);
            setPulse(true);
            announce(payload.new as RowLike);
            if (onInbox) router.refresh();
          },
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
          void recount();
        })
        .subscribe();
      cleanup = () => void supabase.removeChannel(channel);
    } catch {
      // No Supabase in this environment.
    }

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "PERQLY_NOTIFICATION") {
        // Arrived as a phone notification first: show it here too (doubles are skipped).
        if (event.data.notification) announce(event.data.notification as RowLike);
        else if (document.visibilityState === "visible") playSound("notify");
        void recount();
        if (onInbox) router.refresh();
      }
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void recount();
      const waiting = pending.current;
      pending.current = null;
      // Only if it's recent; older ones are in the bell.
      if (waiting && Date.now() - waiting.at < 10 * 60 * 1000) announce(waiting.row);
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cleanup();
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, onInbox, recount, router, announce]);

  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setPulse(false), 1200);
    return () => window.clearTimeout(t);
  }, [pulse]);

  return (
    <>
      <NotificationToast key={toast?.id ?? "none"} toast={toast} onClose={closeToast} />
      <Link
        href="/account/notifications"
        className="relative grid size-10 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
      >
        <Bell className={pulse ? "size-5 motion-safe:animate-[bell-ring_0.6s_ease-in-out_2]" : "size-5"} aria-hidden />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-orange-500 px-1 text-[0.6875rem] leading-4 font-bold text-white"
            aria-hidden
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
    </>
  );
}
