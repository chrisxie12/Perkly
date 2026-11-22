"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, CheckCheck, Copy, ImagePlus, Reply, SendHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { playSound } from "@/lib/sound";
import { markRoomRead, reactInRoom, sendRoomMessage } from "./actions";
import {
  REACTIONS,
  photoPathFor,
  place,
  seenState,
  snippet,
  tally,
  toRoomMessage,
  typingTopic,
  upsertReaction,
  type RoomKind,
  type RoomMe,
  type RoomMessage,
  type RoomReaction,
} from "./model";
import { MAX_UPLOAD_BYTES, shrinkPhoto } from "./photo";
import { TYPING_EVENT, type TypingDetail } from "./header-status";

const time = new Intl.DateTimeFormat("en-GH", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Accra" });

const TABLE = {
  shop: { messages: "messages", chatColumn: "conversation_id", chat: "conversations", reactions: "message_reactions" },
  friend: { messages: "friend_messages", chatColumn: "chat_id", chat: "friend_chats", reactions: "friend_message_reactions" },
} as const;

/** How long "typing…" stays up after the last signal, and how often we send one. */
const TYPING_SHOW_MS = 4000;
const TYPING_SEND_MS = 2500;

type Draft = { file: File; preview: string } | null;

/** One chat room for both business chats and friend chats. */
export function ChatRoom({
  kind,
  chatId,
  me,
  otherName,
  initialMessages,
  initialReactions,
  initialOtherReadAt,
  blocked,
  blockedText,
  emptyText,
  emptyCard,
}: {
  kind: RoomKind;
  chatId: string;
  me: RoomMe;
  otherName: string;
  initialMessages: RoomMessage[];
  initialReactions: RoomReaction[];
  initialOtherReadAt: string | null;
  blocked: boolean;
  blockedText: string;
  emptyText: string;
  /** Shown instead of emptyText before the first message, such as the shop and its deals. */
  emptyCard?: React.ReactNode;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages);
  const [reactions, setReactions] = useState<RoomReaction[]>(initialReactions);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(initialOtherReadAt);
  const [otherTyping, setOtherTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState<Draft>(null);
  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typingChannel = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const placed = useMemo(() => place(messages), [messages]);
  const receipt = useMemo(() => seenState(messages, otherReadAt), [messages, otherReadAt]);

  // Live: new messages, the other person reading, reactions, and typing.
  useEffect(() => {
    void markRoomRead(kind, chatId);
    const t = TABLE[kind];
    let cleanup = () => {};
    try {
      const supabase = createClient();
      const live = supabase
        .channel(`room:${kind}:${chatId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: t.messages, filter: `${t.chatColumn}=eq.${chatId}` },
          async (payload) => {
            const m = toRoomMessage(payload.new as Parameters<typeof toRoomMessage>[0], meRef.current);
            if (m.photo_path) {
              const { data } = await supabase.storage.from("chat-photos").createSignedUrl(m.photo_path, 3600);
              m.photo_url = data?.signedUrl ?? null;
            }
            setMessages((list) => {
              const i = list.findIndex((x) => x.id === m.id);
              if (i === -1) return [...list, m];
              // Our own send already landed: keep the local preview until the signed link is ready.
              return list.map((x) => (x.id === m.id ? { ...m, photo_url: m.photo_url ?? x.photo_url } : x));
            });
            if (!m.mine) {
              setOtherTyping(false);
              if (document.visibilityState === "visible") {
                playSound("message");
                void markRoomRead(kind, chatId);
              }
            }
          },
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: t.chat, filter: `id=eq.${chatId}` }, (payload) => {
          const row = payload.new as Record<string, string | null>;
          const m = meRef.current;
          const read =
            m.kind === "shop"
              ? m.side === "student"
                ? row.merchant_read_at
                : row.student_read_at
              : row.user_a === m.userId
                ? row.b_read_at
                : row.a_read_at;
          if (read) setOtherReadAt((prev) => (prev && prev > read ? prev : read));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: t.reactions }, (payload) => {
          const r = payload.new as RoomReaction | undefined;
          if (r?.message_id) setReactions((list) => upsertReaction(list, r));
        })
        .subscribe();

      const typing = supabase.channel(typingTopic(kind, chatId), { config: { private: true, broadcast: { self: false } } });
      typing
        .on("broadcast", { event: "typing" }, () => {
          setOtherTyping(true);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setOtherTyping(false), TYPING_SHOW_MS);
        })
        .on("broadcast", { event: "stopped" }, () => setOtherTyping(false));
      void supabase.realtime.setAuth().then(() => typing.subscribe());
      typingChannel.current = typing;

      const onVisible = () => {
        if (document.visibilityState === "visible") void markRoomRead(kind, chatId);
      };
      document.addEventListener("visibilitychange", onVisible);
      cleanup = () => {
        document.removeEventListener("visibilitychange", onVisible);
        void supabase.removeChannel(live);
        void supabase.removeChannel(typing);
        typingChannel.current = null;
      };
    } catch {
      // No Supabase in this environment.
    }
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      cleanup();
    };
  }, [kind, chatId]);

  // Tell the header, so it can say "typing…" under the name.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent<TypingDetail>(TYPING_EVENT, { detail: { chatId, typing: otherTyping } }));
  }, [chatId, otherTyping]);

  // Keep the newest message in view when something arrives.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, otherTyping]);

  // Tapping anywhere else closes the message menu.
  useEffect(() => {
    if (!selected) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(`[data-msg="${selected}"]`)) setSelected(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [selected]);

  const signalTyping = useCallback((stopped = false) => {
    const ch = typingChannel.current;
    if (!ch) return;
    const now = Date.now();
    if (!stopped && now - lastTypingSent.current < TYPING_SEND_MS) return;
    lastTypingSent.current = stopped ? 0 : now;
    void ch.send({ type: "broadcast", event: stopped ? "stopped" : "typing", payload: {} });
  }, []);

  function pickPhoto(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !file.type.startsWith("image/")) {
      setError("Choose a photo (JPEG, PNG or WebP).");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("That photo is too big. Choose one under 25 MB.");
      return;
    }
    setPhoto({ file, preview: URL.createObjectURL(file) });
    input.current?.focus();
  }

  function send(retry?: RoomMessage & { file?: File }) {
    const body = retry ? retry.body : draft.trim();
    const file = retry ? retry.file : photo?.file;
    const reply = retry ? retry.reply_to : (replyTo?.id ?? null);
    if (!body && !file) return;
    const tempId = retry?.id ?? `temp-${crypto.randomUUID()}`;
    const preview = retry?.photo_url ?? photo?.preview ?? null;
    setError(null);
    setMessages((list) => [
      ...list.filter((m) => m.id !== tempId),
      {
        id: tempId,
        mine: true,
        body,
        created_at: new Date().toISOString(),
        reply_to: reply,
        photo_path: file ? "pending" : null,
        photo_url: preview,
        pending: true,
        file,
      } as RoomMessage,
    ]);
    if (!retry) {
      setDraft("");
      setPhoto(null);
      setReplyTo(null);
      signalTyping(true);
    }
    startTransition(async () => {
      let path: string | null = null;
      if (file) {
        try {
          const { blob, ext } = await shrinkPhoto(file);
          if (blob.size > MAX_UPLOAD_BYTES) throw new Error("too big");
          path = photoPathFor(kind, chatId, me.userId, ext);
          const supabase = createClient();
          const { error: upErr } = await supabase.storage.from("chat-photos").upload(path, blob, { contentType: blob.type, upsert: false });
          if (upErr) throw upErr;
        } catch {
          fail(tempId, "That photo didn't upload. Check your connection and try again.");
          return;
        }
      }
      const result = await sendRoomMessage(kind, chatId, body, reply, path);
      if (!result.ok) {
        fail(tempId, result.error);
        return;
      }
      setMessages((list) => {
        // Realtime may already have delivered it.
        const landed = list.find((m) => m.id === result.id);
        if (landed)
          return list.filter((m) => m.id !== tempId).map((m) => (m.id === result.id ? { ...m, photo_url: m.photo_url ?? preview } : m));
        return list.map((m) =>
          m.id === tempId ? { ...m, id: result.id, created_at: result.createdAt, photo_path: path, pending: false, failed: false } : m,
        );
      });
    });
  }

  function fail(tempId: string, message: string) {
    setMessages((list) => list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    setError(message);
  }

  function react(m: RoomMessage, emoji: string) {
    setSelected(null);
    const current = reactions.find((r) => r.message_id === m.id && r.user_id === me.userId)?.emoji ?? null;
    const next = current === emoji ? null : emoji;
    const before = reactions;
    setReactions((list) => upsertReaction(list, { message_id: m.id, user_id: me.userId, emoji: next }));
    startTransition(async () => {
      const result = await reactInRoom(kind, m.id, next);
      if (!result.ok) {
        setReactions(before);
        setError(result.error ?? "Couldn't react. Try again.");
      }
    });
  }

  function jumpTo(id: string) {
    const el = document.querySelector<HTMLElement>(`[data-msg="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1600);
  }

  const canSend = (draft.trim().length > 0 || !!photo) && draft.trim().length <= 1000;
  const who = (m: RoomMessage | undefined) => (m?.mine ? "You" : otherName);

  return (
    <div className="flex min-h-[calc(100dvh-15rem)] flex-col md:min-h-[calc(100dvh-12rem)]">
      <ol className="flex flex-1 flex-col px-1 pb-4" aria-label="Messages">
        {messages.length === 0 &&
          (emptyCard ? (
            <li className="mt-auto pt-6 pb-2">{emptyCard}</li>
          ) : (
            <li className="m-auto max-w-[30ch] py-10 text-center text-[0.9375rem] text-ink-600">{emptyText}</li>
          ))}
        {placed.map((m) => {
          const quoted = m.reply_to ? byId.get(m.reply_to) : undefined;
          const counts = tally(reactions, m.id, me.userId);
          const isSelected = selected === m.id;
          const photoOnly = !!m.photo_path && !m.body;
          const canAct = !m.pending && !m.failed && !m.id.startsWith("temp-");
          return (
            <li
              key={m.id}
              data-msg={m.id}
              className={cn(
                "flex flex-col",
                m.mine ? "items-end" : "items-start",
                m.first ? "mt-3" : "mt-0.5",
                counts.length > 0 && "mb-4",
              )}
            >
              {m.dayLabel && (
                <p className="mx-auto my-3 rounded-full bg-ink-100/80 px-3 py-1 text-xs font-semibold text-ink-600 backdrop-blur">
                  {m.dayLabel}
                </p>
              )}

              {m.reply_to && (
                <button
                  type="button"
                  onClick={() => quoted && jumpTo(quoted.id)}
                  className={cn(
                    "mb-1 max-w-[70%] rounded-2xl bg-ink-100 px-3 py-1.5 text-left text-[0.8125rem] leading-snug text-ink-600",
                    m.mine ? "mr-1" : "ml-1",
                  )}
                >
                  <span className="block text-xs font-semibold text-ink-700">
                    {m.mine ? "You" : otherName} replied to {quoted ? (quoted.mine === m.mine ? "themselves" : who(quoted)) : "a message"}
                  </span>
                  <span className="line-clamp-2">{snippet(quoted)}</span>
                </button>
              )}

              {isSelected && canAct && !blocked && (
                <div
                  role="toolbar"
                  aria-label="Message options"
                  className="glass anim-pop mb-1.5 flex items-center gap-0.5 rounded-full p-1"
                >
                  {REACTIONS.map((e) => {
                    const on = counts.some((c) => c.emoji === e && c.mine);
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => react(m, e)}
                        aria-label={on ? `Remove ${e}` : `React ${e}`}
                        aria-pressed={on}
                        className={cn(
                          "grid size-10 place-items-center rounded-full text-xl transition-transform active:scale-90",
                          on && "bg-blue-100",
                        )}
                      >
                        {e}
                      </button>
                    );
                  })}
                  <span aria-hidden className="mx-1 h-6 w-px bg-ink-200" />
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(m);
                      setSelected(null);
                      input.current?.focus();
                    }}
                    aria-label="Reply"
                    className="grid size-10 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
                  >
                    <Reply className="size-5" aria-hidden />
                  </button>
                  {m.body && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(m.body);
                        setSelected(null);
                      }}
                      aria-label="Copy text"
                      className="grid size-10 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
                    >
                      <Copy className="size-5" aria-hidden />
                    </button>
                  )}
                </div>
              )}

              <div className="relative max-w-[80%]">
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`${who(m)}: ${snippet(m) || "message"}. Options`}
                  aria-expanded={isSelected}
                  onClick={() => canAct && setSelected(isSelected ? null : m.id)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && canAct) {
                      e.preventDefault();
                      setSelected(isSelected ? null : m.id);
                    }
                  }}
                  onDoubleClick={() => canAct && !blocked && react(m, "❤️")}
                  className={cn(
                    "cursor-pointer overflow-hidden text-[0.9375rem] leading-snug break-words whitespace-pre-wrap transition-[transform,box-shadow] select-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:scale-[0.98]",
                    "rounded-[1.25rem]",
                    m.mine
                      ? cn(
                          "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-900/15",
                          !m.last && "rounded-br-md",
                          !m.first && "rounded-tr-md",
                          m.last && "rounded-br-[0.4rem]",
                        )
                      : cn(
                          "bg-white text-ink-900 shadow-sm ring-1 ring-ink-200/70",
                          !m.last && "rounded-bl-md",
                          !m.first && "rounded-tl-md",
                          m.last && "rounded-bl-[0.4rem]",
                        ),
                    photoOnly ? "p-0" : m.photo_path ? "pb-2" : "px-3.5 py-2",
                    m.pending && "opacity-70",
                    (isSelected || highlight === m.id) && "ring-2 ring-blue-400 ring-offset-2 ring-offset-paper",
                  )}
                >
                  {m.photo_path &&
                    (m.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private signed link or local preview
                      <img
                        src={m.photo_url}
                        alt={m.body ? "" : `Photo from ${who(m)}`}
                        className="block max-h-80 w-full min-w-40 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="grid h-40 w-56 place-items-center bg-ink-100 text-sm text-ink-600">Photo</span>
                    ))}
                  {m.body && <span className={cn("block", m.photo_path && "px-3.5 pt-2")}>{m.body}</span>}
                </div>

                {counts.length > 0 && (
                  <div className={cn("absolute -bottom-5 flex gap-0.5", m.mine ? "left-2" : "right-2")}>
                    {counts.map((c) => (
                      <button
                        key={c.emoji}
                        type="button"
                        onClick={() => !blocked && react(m, c.emoji)}
                        aria-label={`${c.emoji} ${c.count}${c.mine ? ", including you. Tap to remove" : ""}`}
                        className={cn(
                          "flex h-7 items-center gap-0.5 rounded-full bg-white px-1.5 text-sm shadow-sm ring-2",
                          c.mine ? "ring-blue-300" : "ring-ink-200",
                        )}
                      >
                        <span aria-hidden>{c.emoji}</span>
                        {c.count > 1 && <span className="text-xs font-semibold text-ink-700">{c.count}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {(m.last || m.failed || m.pending) && (
                <span className={cn("mt-1 flex items-center gap-1 px-1.5 text-[0.6875rem] text-ink-600", counts.length > 0 && "mt-5")}>
                  {m.failed ? (
                    <button
                      type="button"
                      onClick={() => send(m as RoomMessage & { file?: File })}
                      className="font-semibold text-red-700 underline"
                    >
                      Not sent. Tap to retry
                    </button>
                  ) : m.pending ? (
                    "Sending…"
                  ) : (
                    <>
                      {time.format(new Date(m.created_at))}
                      {receipt?.id === m.id &&
                        (receipt.seen ? (
                          <span className="inline-flex items-center gap-0.5 font-semibold text-blue-700">
                            <CheckCheck className="size-3.5" aria-hidden /> Seen
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5">
                            <Check className="size-3.5" aria-hidden /> Sent
                          </span>
                        ))}
                    </>
                  )}
                </span>
              )}
            </li>
          );
        })}
        {otherTyping && (
          <li className="mt-3 flex items-start" aria-live="polite">
            <span className="sr-only">{otherName} is typing</span>
            <span
              aria-hidden
              className="flex items-center gap-1 rounded-[1.25rem] rounded-bl-[0.4rem] bg-white px-4 py-3 shadow-sm ring-1 ring-ink-200/70"
            >
              <span className="typing-dot" />
              <span className="typing-dot [animation-delay:150ms]" />
              <span className="typing-dot [animation-delay:300ms]" />
            </span>
          </li>
        )}
        <div ref={end} />
      </ol>

      {blocked ? (
        <p className="sticky bottom-[var(--frame-bottom,7rem)] rounded-2xl bg-ink-50 px-4 py-3 text-center text-sm text-ink-700 md:bottom-4">
          {blockedText}
        </p>
      ) : (
        <div className="glass sticky bottom-[var(--frame-bottom,7rem)] rounded-[1.75rem] p-1.5 md:bottom-4">
          {(replyTo || photo) && (
            <div className="flex items-center gap-2 px-2 pt-1 pb-2">
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element -- local preview
                <img src={photo.preview} alt="Photo to send" className="size-14 shrink-0 rounded-xl object-cover" />
              )}
              <span className="min-w-0 flex-1 border-l-2 border-blue-500 pl-2 text-sm">
                {replyTo ? (
                  <>
                    <span className="block text-xs font-semibold text-blue-700">Replying to {who(replyTo)}</span>
                    <span className="block truncate text-ink-700">{snippet(replyTo)}</span>
                  </>
                ) : (
                  <span className="block text-ink-700">Add a caption, or just send the photo.</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setReplyTo(null);
                  if (photo) URL.revokeObjectURL(photo.preview);
                  setPhoto(null);
                }}
                aria-label={replyTo && photo ? "Cancel reply and photo" : replyTo ? "Cancel reply" : "Remove photo"}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-600 hover:bg-ink-100"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
          )}
          <form
            className="flex items-end gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSend) send();
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                pickPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label="Add a photo"
              className="grid size-11 shrink-0 place-items-center rounded-full text-blue-700 hover:bg-blue-50"
            >
              <ImagePlus className="size-5" aria-hidden />
            </button>
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <textarea
              ref={input}
              id="chat-input"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value.slice(0, 1000));
                if (e.target.value.trim()) signalTyping();
              }}
              onBlur={() => signalTyping(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                  e.preventDefault();
                  if (canSend) send();
                }
              }}
              rows={1}
              placeholder={photo ? "Add a caption" : "Message"}
              className="[field-sizing:content] max-h-32 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[0.9375rem] text-ink-900 placeholder:text-ink-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-600 text-white transition-transform active:scale-90 disabled:bg-ink-200 disabled:text-ink-600"
            >
              <SendHorizontal className="size-5" aria-hidden />
            </button>
          </form>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-center text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
