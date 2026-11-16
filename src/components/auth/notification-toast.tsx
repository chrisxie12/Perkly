"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { LogoMark } from "@/components/shared/logo";

export type ToastNotification = { id: string; title: string; body: string | null; hasLink: boolean };

/** A banner that drops in from the top for a new notification; tap to open, swipe up or ✕ to dismiss. */
export function NotificationToast({ toast, onClose }: { toast: ToastNotification | null; onClose: () => void }) {
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  const content = (
    <span className="flex min-w-0 flex-1 items-start gap-3">
      <LogoMark className="mt-0.5 size-9 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-600">
          <Bell className="size-3" aria-hidden /> Perqly · now
        </span>
        <span className="block truncate font-bold text-ink-900">{toast.title}</span>
        {toast.body && <span className="line-clamp-2 text-sm text-ink-700">{toast.body}</span>}
      </span>
    </span>
  );
  return (
    <div role="status" aria-live="polite" className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3">
      <div
        className="pointer-events-auto mt-3 flex w-full max-w-md items-start gap-2 rounded-3xl bg-white/95 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.2)] ring-1 ring-black/5 backdrop-blur-xl motion-safe:animate-[toast-in_0.35s_cubic-bezier(0.2,0.9,0.3,1.2)]"
        style={{ transform: drag < 0 ? `translateY(${drag}px)` : undefined, opacity: drag < 0 ? 1 + drag / 120 : undefined }}
        onTouchStart={(e) => (startY.current = e.touches[0]!.clientY)}
        onTouchMove={(e) => {
          if (startY.current !== null) setDrag(Math.min(0, e.touches[0]!.clientY - startY.current));
        }}
        onTouchEnd={() => {
          if (drag < -40) onClose();
          else setDrag(0);
          startY.current = null;
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
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink-600 hover:bg-ink-100"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
