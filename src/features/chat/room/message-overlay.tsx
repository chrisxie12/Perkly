"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Copy, Pin, PinOff, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUICK_REACTIONS } from "./emoji";

const BAR_H = 60;
const MENU_W = 232;
const GAP = 10;

/**
 * What holding a message opens: the page dims, the message lifts, a reaction bar sits above it
 * and a menu below it (Reply, Copy, Pin). Like WhatsApp and iMessage.
 */
export function MessageOverlay({
  rect,
  mine,
  preview,
  myReaction,
  canReact,
  canReply,
  canCopy,
  pinned,
  onReact,
  onMore,
  onReply,
  onCopy,
  onPin,
  onClose,
}: {
  rect: { top: number; left: number; right: number; width: number; height: number };
  mine: boolean;
  preview: React.ReactNode;
  myReaction: string | null;
  canReact: boolean;
  canReply: boolean;
  canCopy: boolean;
  pinned: boolean;
  onReact: (emoji: string) => void;
  onMore: () => void;
  onReply: () => void;
  onCopy: () => void;
  onPin: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = before;
    };
  }, [onClose]);

  // Place the lifted message so the bar fits above it and the menu below, on any screen.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const items = [canReply, canCopy, true].filter(Boolean).length;
  const menuH = items * 52 + 12;
  // The press shrinks the bubble a little (active:scale-[0.98]): measure back up, with room to spare.
  const height = rect.height / 0.98 + 4;
  const maxH = Math.min(height, vh * 0.4);
  const top = Math.max(BAR_H + GAP + 16, Math.min(rect.top, vh - menuH - maxH - GAP - 16));
  const side = mine ? { right: Math.max(12, vw - rect.right) } : { left: Math.max(12, rect.left) };
  const barW = Math.min(vw - 24, QUICK_REACTIONS.length * 46 + 54);
  const barSide = mine
    ? { right: Math.max(12, Math.min(vw - rect.right, vw - barW - 12)) }
    : { left: Math.max(12, Math.min(rect.left, vw - barW - 12)) };
  const menuSide = mine ? { right: Math.max(12, vw - rect.right) } : { left: Math.max(12, Math.min(rect.left, vw - MENU_W - 12)) };

  const item =
    "flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl px-3.5 text-left text-base font-medium text-ink-900 hover:bg-ink-100";

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Message options">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/35 backdrop-blur-md [-webkit-tap-highlight-color:transparent]"
      />

      {canReact && (
        <div
          role="toolbar"
          aria-label="React"
          className="anim-pop absolute flex items-center gap-0.5 rounded-full bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(0,31,82,0.45)] ring-1 ring-ink-200"
          style={{ top: top - BAR_H - GAP, ...barSide }}
        >
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onReact(e)}
              aria-label={myReaction === e ? `Remove ${e}` : `React ${e}`}
              aria-pressed={myReaction === e}
              className={cn(
                "grid size-11 place-items-center rounded-full text-[1.65rem] transition-transform hover:scale-110 active:scale-90",
                myReaction === e && "bg-blue-100",
              )}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            onClick={onMore}
            aria-label="More reactions"
            className="grid size-10 place-items-center rounded-full bg-ink-100 text-ink-700"
          >
            <ChevronDown className="size-5" aria-hidden />
          </button>
        </div>
      )}

      <div
        className="pointer-events-none absolute"
        style={{
          top,
          ...side,
          width: rect.width / 0.98,
          maxHeight: height > vh * 0.4 ? maxH : undefined,
          overflow: height > vh * 0.4 ? "hidden" : undefined,
        }}
      >
        {preview}
      </div>

      <div
        role="menu"
        className="anim-pop absolute rounded-2xl bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(0,31,82,0.45)] ring-1 ring-ink-200"
        style={{ top: top + maxH + GAP, width: MENU_W, ...menuSide }}
      >
        {canReply && (
          <button role="menuitem" type="button" onClick={onReply} className={item}>
            Reply <Reply className="size-5 text-ink-600" aria-hidden />
          </button>
        )}
        {canCopy && (
          <button role="menuitem" type="button" onClick={onCopy} className={item}>
            Copy <Copy className="size-5 text-ink-600" aria-hidden />
          </button>
        )}
        <button role="menuitem" type="button" onClick={onPin} className={item}>
          {pinned ? "Unpin" : "Pin"}
          {pinned ? <PinOff className="size-5 text-ink-600" aria-hidden /> : <Pin className="size-5 text-ink-600" aria-hidden />}
        </button>
      </div>
    </div>,
    document.body,
  );
}
