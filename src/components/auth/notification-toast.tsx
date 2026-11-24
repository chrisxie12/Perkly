"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { notificationIcon, type NotificationGroup } from "@/lib/notifications/style";

export type ToastNotification = {
  id: string;
  title: string;
  body: string | null;
  hasLink: boolean;
  group: NotificationGroup;
  /** Same chat or type as the banner already showing: they merge, like a messaging app. */
  tag: string;
  count: number;
};

const TINT: Record<NotificationGroup, string> = {
  chat: "bg-blue-50 dark:bg-[#14244B]",
  deal: "bg-orange-50 dark:bg-[#2B2118]",
  verified: "bg-emerald-50 dark:bg-[#14261D]",
  booking: "bg-sky-50 dark:bg-[#13222F]",
  campus: "bg-amber-50 dark:bg-[#2B2118]",
  account: "bg-ink-100 dark:bg-[#1A2130]",
  general: "bg-ink-100 dark:bg-[#1A2130]",
};

/**
 * A banner that drops in from the top for a new notification, the way WhatsApp's does:
 * a picture for its type, who or what it's from, a two-line preview, and a count when
 * several from the same chat arrive together. Tap to open; swipe up or sideways (or ✕) to
 * dismiss. It waits while your finger is on it.
 */
export function NotificationToast({ toast, onClose }: { toast: ToastNotification | null; onClose: () => void }) {
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [holding, setHolding] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!toast || holding) return;
    const t = window.setTimeout(onClose, 5500);
    return () => window.clearTimeout(t);
  }, [toast, holding, onClose]);

  if (!toast) return null;
  const away = Math.max(Math.abs(drag.x), -Math.min(0, drag.y));
  const content = (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span aria-hidden className={`grid size-11 shrink-0 place-items-center rounded-full ${TINT[toast.group]}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- small local picture */}
        <img src={notificationIcon(toast.group)} alt="" width={28} height={28} className="size-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-bold text-ink-900 dark:text-white">{toast.title}</span>
          <span className="shrink-0 text-xs text-ink-600 dark:text-[#94A3B8]">now</span>
        </span>
        {toast.count > 1 && (
          <span className="block text-xs font-semibold text-blue-700 dark:text-[#60A5FA]">{toast.count} new messages</span>
        )}
        {toast.body && <span className="line-clamp-2 text-sm text-ink-700 dark:text-[#CBD5E1]">{toast.body}</span>}
      </span>
    </span>
  );
  return (
    <div role="status" aria-live="polite" className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3">
      <div
        className="pointer-events-auto mt-2.5 flex w-full max-w-md items-center gap-1 rounded-[22px] bg-white/95 py-2.5 pr-1.5 pl-3 shadow-[0_18px_44px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/5 backdrop-blur-xl motion-safe:animate-[toast-in_0.35s_cubic-bezier(0.2,0.9,0.3,1.2)] dark:bg-[#141B29]/95 dark:ring-white/10"
        style={{
          transform: away ? `translate(${drag.x}px, ${Math.min(0, drag.y)}px)` : undefined,
          opacity: away ? Math.max(0, 1 - away / 160) : undefined,
        }}
        onTouchStart={(e) => {
          const t = e.touches[0]!;
          start.current = { x: t.clientX, y: t.clientY };
          setHolding(true);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0]!;
          if (start.current) setDrag({ x: t.clientX - start.current.x, y: t.clientY - start.current.y });
        }}
        onTouchEnd={() => {
          if (Math.abs(drag.x) > 90 || drag.y < -40) onClose();
          else setDrag({ x: 0, y: 0 });
          start.current = null;
          setHolding(false);
        }}
      >
        {toast.hasLink ? (
          <Link href={`/account/notifications/open/${toast.id}`} prefetch={false} onClick={onClose} className="flex min-w-0 flex-1">
            {content}
          </Link>
        ) : (
          content
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="grid size-10 shrink-0 place-items-center rounded-full text-ink-600 hover:bg-ink-100 dark:text-[#94A3B8] dark:hover:bg-white/10"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
