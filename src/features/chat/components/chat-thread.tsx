"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { playSound } from "@/lib/sound";
import { markConversationRead, sendMessage } from "../actions";
import type { ChatMessage, ChatSide } from "../queries";

const ghanaDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
const time = new Intl.DateTimeFormat("en-GH", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Accra" });
const day = new Intl.DateTimeFormat("en-GH", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  if (ghanaDay(d) === ghanaDay(new Date(now))) return "Today";
  if (ghanaDay(d) === ghanaDay(new Date(now - 86_400_000))) return "Yesterday";
  return day.format(d);
}

type Shown = ChatMessage & { pending?: boolean; failed?: boolean };

export function ChatThread({
  conversationId,
  me,
  initialMessages,
  blocked,
  blockedText,
  emptyText,
}: {
  conversationId: string;
  me: ChatSide;
  initialMessages: ChatMessage[];
  blocked: boolean;
  blockedText: string;
  emptyText: string;
}) {
  const [messages, setMessages] = useState<Shown[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  // New messages arrive live; reading the chat marks it read.
  useEffect(() => {
    void markConversationRead(conversationId);
    let cleanup = () => {};
    try {
      const supabase = createClient();
      const channel = supabase
        .channel(`chat:${conversationId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          (payload) => {
            const m = payload.new as ChatMessage;
            setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
            if (m.sender_side !== me && document.visibilityState === "visible") {
              playSound("message");
              void markConversationRead(conversationId);
            }
          },
        )
        .subscribe();
      cleanup = () => void supabase.removeChannel(channel);
    } catch {
      // No Supabase in this environment.
    }
    return () => cleanup();
  }, [conversationId, me]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function send(text: string, retryId?: string) {
    const body = text.trim();
    if (!body) return;
    const tempId = retryId ?? `temp-${crypto.randomUUID()}`;
    setError(null);
    setMessages((list) => [
      ...list.filter((m) => m.id !== tempId),
      { id: tempId, sender_side: me, body, created_at: new Date().toISOString(), pending: true },
    ]);
    if (!retryId) setDraft("");
    startTransition(async () => {
      const result = await sendMessage(conversationId, body);
      setMessages((list) => {
        if (!result.ok) return list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m));
        // Realtime may already have delivered it.
        if (list.some((m) => m.id === result.id)) return list.filter((m) => m.id !== tempId);
        return list.map((m) => (m.id === tempId ? { ...m, id: result.id, created_at: result.createdAt, pending: false } : m));
      });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex min-h-[calc(100dvh-15rem)] flex-col md:min-h-[calc(100dvh-12rem)]">
      <ol className="flex flex-1 flex-col gap-1.5 px-1 pb-4" aria-label="Messages" aria-live="polite">
        {messages.length === 0 && <li className="m-auto max-w-[30ch] py-10 text-center text-[0.9375rem] text-ink-600">{emptyText}</li>}
        {messages.map((m, i) => {
          const mine = m.sender_side === me;
          const label = dayLabel(m.created_at);
          const showDay = i === 0 || label !== dayLabel(messages[i - 1].created_at);
          return (
            <li key={m.id} className="contents">
              {showDay && <p className="my-2 self-center text-xs font-semibold text-ink-600">{label}</p>}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-snug break-words whitespace-pre-wrap",
                  mine
                    ? "self-end rounded-br-md bg-blue-600 text-white"
                    : "self-start rounded-bl-md bg-white text-ink-900 ring-1 ring-ink-200/70",
                  m.pending && "opacity-70",
                )}
              >
                {m.body}
                <span className={cn("mt-0.5 block text-right text-[0.6875rem]", mine ? "text-white/75" : "text-ink-600")}>
                  {m.failed ? (
                    <button type="button" onClick={() => send(m.body, m.id)} className="font-semibold underline">
                      Not sent. Tap to retry
                    </button>
                  ) : m.pending ? (
                    "Sending…"
                  ) : (
                    time.format(new Date(m.created_at))
                  )}
                </span>
              </div>
            </li>
          );
        })}
        <div ref={end} />
      </ol>

      {blocked ? (
        <p className="sticky bottom-28 rounded-2xl bg-ink-50 px-4 py-3 text-center text-sm text-ink-700 md:bottom-4">{blockedText}</p>
      ) : (
        <form
          className="sticky bottom-28 flex items-end gap-2 rounded-3xl bg-white p-1.5 shadow-sm ring-1 ring-ink-200 md:bottom-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Message
          </label>
          <textarea
            id="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={1}
            placeholder="Write a message"
            className="[field-sizing:content] max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[0.9375rem] text-ink-900 placeholder:text-ink-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-600 text-white disabled:bg-ink-200 disabled:text-ink-600"
          >
            <SendHorizontal className="size-5" aria-hidden />
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-center text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
