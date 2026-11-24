"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOpenSwipe, type SwipeStart } from "./profile-drawer-gesture";

/**
 * The students' profile and settings panel. It slides in from the left when
 * you swipe right on Home, or tap the Perqly logo in the top bar (the button
 * is there for people who don't swipe and for screen readers, which can't).
 * Its contents are the Me page, rendered on the server and passed in.
 */
export function ProfileDrawer({
  trigger,
  triggerLabel,
  children,
}: {
  trigger: React.ReactNode;
  triggerLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const panel = React.useRef<HTMLDivElement>(null);
  const opener = React.useRef<HTMLButtonElement>(null);
  const start = React.useRef<SwipeStart | null>(null);

  // Swipe right on Home opens it.
  React.useEffect(() => {
    if (pathname !== "/student" || open) return;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      const target = e.target instanceof Element ? e.target : null;
      start.current =
        e.touches.length === 1 && t
          ? {
              x: t.clientX,
              y: t.clientY,
              // Sideways rows, maps, text fields and anything marked keep their own swipes.
              blocked: Boolean(target?.closest("[data-no-swipe], input, textarea, select, [contenteditable='true']")),
            }
          : null;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (start.current && t && isOpenSwipe(start.current, { x: t.clientX, y: t.clientY }, window.innerWidth)) setOpen(true);
      start.current = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [pathname, open]);

  // While open: Escape closes, the page behind doesn't scroll, focus moves in and comes back.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const button = opener.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key !== "Tab" || !panel.current) return;
      const items = panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, [tabindex='0']");
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      (previous ?? button)?.focus?.();
    };
  }, [open]);

  // Swipe left on the panel closes it.
  const closeStart = React.useRef<number | null>(null);

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerLabel}
        className="press relative shrink-0 rounded-2xl"
      >
        {trigger}
      </button>
      <div className={cn("fixed inset-0 z-50", open ? "" : "pointer-events-none")} aria-hidden={!open}>
        <div
          className={cn(
            "absolute inset-0 bg-ink-900/40 transition-opacity duration-300 motion-reduce:transition-none",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setOpen(false)}
        />
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label="Your profile and settings"
          tabIndex={-1}
          inert={!open}
          // Following a link in the panel (or signing out) closes it.
          onClick={(e) => {
            if (e.target instanceof Element && e.target.closest("a[href]")) setOpen(false);
          }}
          onTouchStart={(e) => (closeStart.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const x = e.changedTouches[0]?.clientX;
            if (closeStart.current !== null && x !== undefined && closeStart.current - x > 70) setOpen(false);
            closeStart.current = null;
          }}
          className={cn(
            "pt-safe pb-safe absolute inset-y-0 left-0 flex w-[min(22rem,88vw)] flex-col bg-paper shadow-2xl outline-none",
            "transition-transform duration-300 ease-out motion-reduce:transition-none",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <p className="font-display text-lg font-bold">You</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid size-11 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        </div>
      </div>
    </>
  );
}
