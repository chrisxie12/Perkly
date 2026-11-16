"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { playSound } from "@/lib/sound";

/**
 * The bell with its unread count, kept current without a refresh: Supabase
 * Realtime (row-level security applies, so only your own rows arrive), a
 * message from the service worker when a phone notification lands, and a
 * re-check whenever the app comes back to the foreground.
 */
export function LiveBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [pulse, setPulse] = useState(false);
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
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
          setUnread((n) => n + 1);
          setPulse(true);
          if (document.visibilityState === "visible") playSound("notify");
          if (onInbox) router.refresh();
        })
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
        // Arrived as a phone notification first: chime here too (the sound module skips doubles).
        if (document.visibilityState === "visible") playSound("notify");
        void recount();
        if (onInbox) router.refresh();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void recount();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cleanup();
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, onInbox, recount, router]);

  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setPulse(false), 1200);
    return () => window.clearTimeout(t);
  }, [pulse]);

  return (
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
      <span className="sr-only" aria-live="polite">
        {pulse ? "New notification" : ""}
      </span>
    </Link>
  );
}
