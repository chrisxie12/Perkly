"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps a redemption screen current: Supabase Realtime (which applies RLS)
 * triggers a refresh when a session changes, and a 5-second poll covers
 * dropped sockets.
 */
export function AutoRefresh({ filter, intervalMs = 5000 }: { filter?: string; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    let cleanup = () => {};
    try {
      const supabase = createClient();
      const channel = supabase
        .channel(`redemptions:${filter ?? "all"}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "redemption_sessions", ...(filter ? { filter } : {}) }, () =>
          router.refresh(),
        )
        .subscribe();
      cleanup = () => void supabase.removeChannel(channel);
    } catch {
      // No Supabase in this environment: polling alone.
    }
    return () => {
      window.clearInterval(timer);
      cleanup();
    };
  }, [filter, intervalMs, router]);
  return null;
}
