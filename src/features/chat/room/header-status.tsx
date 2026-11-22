"use client";

import { useEffect, useState } from "react";

export const TYPING_EVENT = "perqly:typing";
export type TypingDetail = { chatId: string; typing: boolean };

/** The line under the name in a chat's header: "typing…" while the other person types. */
export function HeaderStatus({ chatId, sub }: { chatId: string; sub?: string }) {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<TypingDetail>).detail;
      if (d?.chatId === chatId) setTyping(d.typing);
    };
    window.addEventListener(TYPING_EVENT, on);
    return () => window.removeEventListener(TYPING_EVENT, on);
  }, [chatId]);
  if (typing)
    return (
      <span className="block truncate text-xs font-semibold text-blue-700" aria-live="polite">
        typing…
      </span>
    );
  return sub ? <span className="block truncate text-xs text-ink-600">{sub}</span> : null;
}
