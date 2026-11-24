"use client";

import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISAPPEAR_OPTIONS, type DisappearMode } from "./model";

/** Friend chats: choose when messages disappear. Either friend can change it. */
export function DisappearSheet({
  current,
  onPick,
  onClose,
}: {
  current: DisappearMode;
  onPick: (mode: DisappearMode) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disappear-title"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/40 sm:items-center"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 id="disappear-title" className="font-display text-lg font-bold">
            Disappearing messages
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full hover:bg-ink-100">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-600">
          Applies to new messages, for both of you. Pinned messages stay until you unpin them.
        </p>
        <ul className="mt-3 space-y-2">
          {DISAPPEAR_OPTIONS.map((o) => {
            const on = o.value === current;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => onPick(o.value)}
                  aria-pressed={on}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left",
                    on ? "border-blue-600 bg-blue-50" : "border-ink-200 hover:bg-ink-50",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink-900">{o.label}</span>
                    <span className="block text-sm text-ink-600">{o.detail}</span>
                  </span>
                  {on && <Check className="size-5 shrink-0 text-blue-700" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
