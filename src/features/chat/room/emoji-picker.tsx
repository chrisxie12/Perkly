"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EMOJI_GROUPS } from "./emoji";

/** A bottom sheet with the full emoji set, grouped. Calls onPick with one emoji. */
export function EmojiSheet({ title, onPick, onClose }: { title: string; onPick: (emoji: string) => void; onClose: () => void }) {
  const [group, setGroup] = useState(0);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/40 sm:items-center"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-white pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:rounded-3xl">
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full hover:bg-ink-100"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div role="tablist" aria-label="Emoji groups" className="flex [scrollbar-width:none] gap-1 overflow-x-auto px-3 pt-1 pb-2">
          {EMOJI_GROUPS.map((g, i) => (
            <button
              key={g.name}
              role="tab"
              type="button"
              aria-selected={group === i}
              onClick={() => setGroup(i)}
              className={cn(
                "min-h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold",
                group === i ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700",
              )}
            >
              {g.name}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="grid max-h-[42dvh] grid-cols-8 gap-1 overflow-y-auto px-3">
          {EMOJI_GROUPS[group].emoji.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onPick(e)}
              aria-label={e}
              className="grid aspect-square place-items-center rounded-xl text-[1.6rem] transition-transform hover:bg-ink-100 active:scale-90"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
