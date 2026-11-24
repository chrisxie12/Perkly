"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, CheckCheck, ImagePlus, Keyboard, Pin, SendHorizontal, Smile, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { playSound } from "@/lib/sound";
import { leaveRoom, markRoomRead, pinMessage, reactInRoom, sendRoomMessage, setDisappear } from "./actions";
import { isBigEmoji } from "./emoji";
import { EmojiPanel, EmojiSheet } from "./emoji-picker";
import { MessageOverlay } from "./message-overlay";
import { DisappearSheet } from "./disappear-sheet";
import {
  disappearText,
  isLive,
  latestPin,
  nextExpiry,
  photoPathFor,
  place,
  seenState,
  snippet,
  tally,
  toRoomMessage,
  typingTopic,
  upsertReaction,
  type DisappearMode,
  type Placed,
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
  initialDraft,
  initialDisappear,
  disappearSetBy,
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
  /** Text waiting in the message box, such as something shared from another app. Never sent by itself. */
  initialDraft?: string;
  /** Friend chats: when messages disappear, and who last changed it ("me", "friend" or null). */
  initialDisappear?: DisappearMode;
  disappearSetBy?: "me" | "friend" | null;
}) {
  const [allMessages, setMessages] = useState<RoomMessage[]>(initialMessages);
  const [disappear, setDisappearMode] = useState<DisappearMode | undefined>(initialDisappear);
  const [setBy, setSetBy] = useState(disappearSetBy ?? null);
  const [disappearOpen, setDisappearOpen] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [reactions, setReactions] = useState<RoomReaction[]>(initialReactions);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(initialOtherReadAt);
  const [otherTyping, setOtherTyping] = useState(false);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [photo, setPhoto] = useState<Draft>(null);
  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);
  /** The message being held, and where it sits on screen. */
  const [held, setHeld] = useState<{
    id: string;
    rect: { top: number; left: number; right: number; width: number; height: number };
  } | null>(null);
  /** The full emoji set, for a reaction or for the message box. */
  const [sheet, setSheet] = useState<{ mode: "react"; message: RoomMessage } | { mode: "compose" } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
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

  // Friend chats: a message leaves the screen when it expires. Your own "after viewing" messages go
  // an hour after your friend opened them (the server ends them then at the latest).
  const expiryOf = useCallback(
    (m: RoomMessage) => {
      if (m.once && m.mine && otherReadAt && otherReadAt > m.created_at) {
        const opened = new Date(otherReadAt).getTime() + 3_600_000;
        const own = m.expires_at ? new Date(m.expires_at).getTime() : Infinity;
        return { ...m, expires_at: new Date(Math.min(opened, own)).toISOString() };
      }
      return m;
    },
    [otherReadAt],
  );
  const messages = useMemo(
    () => allMessages.filter((m) => m.pending || m.failed || isLive(expiryOf(m), clock)),
    [allMessages, clock, expiryOf],
  );
  useEffect(() => {
    const next = nextExpiry(allMessages.map(expiryOf), clock);
    if (next === null) return;
    const id = setTimeout(() => setClock(Date.now()), Math.min(next - Date.now() + 250, 2_147_000_000));
    return () => clearTimeout(id);
  }, [allMessages, clock, expiryOf]);

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
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: t.messages, filter: `${t.chatColumn}=eq.${chatId}` },
          (payload) => {
            // Pins, and a friend-chat message's expiry moving.
            const row = payload.new as { id: string; pinned_at?: string | null; expires_at?: string | null };
            setMessages((list) =>
              list.map((x) =>
                x.id === row.id ? { ...x, pinned_at: row.pinned_at ?? null, expires_at: row.expires_at ?? x.expires_at } : x,
              ),
            );
            setClock(Date.now());
          },
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: t.chat, filter: `id=eq.${chatId}` }, (payload) => {
          const row = payload.new as Record<string, string | null>;
          const m = meRef.current;
          if (m.kind === "friend" && (row.disappear === "24h" || row.disappear === "12h" || row.disappear === "seen")) {
            setDisappearMode(row.disappear);
            if (row.disappear_set_by) setSetBy(row.disappear_set_by === m.userId ? "me" : "friend");
          }
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

      // Leaving (or hiding the app) ends "after viewing" messages you've opened.
      const leave = () => {
        if (kind !== "friend") return;
        void leaveRoom(chatId);
        const at = new Date().toISOString();
        setMessages((list) => list.map((x) => (x.once && !x.mine && !x.pinned_at ? { ...x, expires_at: at } : x)));
        setClock(Date.now());
      };
      const onVisible = () => {
        if (document.visibilityState === "visible") void markRoomRead(kind, chatId);
        else leave();
      };
      document.addEventListener("visibilitychange", onVisible);
      cleanup = () => {
        leave();
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
          m.id === tempId
            ? {
                ...m,
                id: result.id,
                created_at: result.createdAt,
                photo_path: path,
                pending: false,
                failed: false,
                ...(kind === "friend" ? localExpiry(result.createdAt, disappear) : {}),
              }
            : m,
        );
      });
    });
  }

  function chooseDisappear(mode: DisappearMode) {
    setDisappearOpen(false);
    if (mode === disappear) return;
    const before = { disappear, setBy };
    setDisappearMode(mode);
    setSetBy("me");
    startTransition(async () => {
      const result = await setDisappear(chatId, mode);
      if (!result.ok) {
        setDisappearMode(before.disappear);
        setSetBy(before.setBy);
        setError(result.error ?? "Couldn't change that. Try again.");
      }
    });
  }

  function fail(tempId: string, message: string) {
    setMessages((list) => list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    setError(message);
  }

  function react(m: RoomMessage, emoji: string) {
    setHeld(null);
    setSheet(null);
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

  function pin(m: RoomMessage) {
    setHeld(null);
    const next = m.pinned_at ? null : new Date().toISOString();
    const before = m.pinned_at ?? null;
    setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, pinned_at: next } : x)));
    startTransition(async () => {
      const result = await pinMessage(kind, m.id, next !== null);
      if (!result.ok) {
        setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, pinned_at: before } : x)));
        setError(result.error ?? "Couldn't pin. Try again.");
      }
    });
  }

  /** Hold a message (or right-click it) to open its options. */
  function openHeld(m: RoomMessage, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    navigator.vibrate?.(12);
    setHeld({ id: m.id, rect: { top: r.top, left: r.left, right: r.right, width: r.width, height: r.height } });
  }
  function holdHandlers(m: RoomMessage, can: boolean) {
    const cancel = () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
      holdStart.current = null;
    };
    return {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (!can || (e.pointerType === "mouse" && e.button !== 0)) return;
        const el = e.currentTarget;
        holdStart.current = { x: e.clientX, y: e.clientY };
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          openHeld(m, el);
        }, 420);
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const s0 = holdStart.current;
        if (s0 && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > 10) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        cancel();
        if (can) openHeld(m, e.currentTarget);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (can && (e.key === "Enter" || e.key === " " || e.key === "ContextMenu")) {
          e.preventDefault();
          openHeld(m, e.currentTarget);
        }
      },
    };
  }

  // Where the cursor was in the message box, so emoji go there while the panel has the
  // keyboard's place (the box isn't focused then, or the keyboard would cover the panel).
  const caret = useRef<{ start: number; end: number } | null>(null);
  const emojiOpen = sheet?.mode === "compose";

  function insertEmoji(emoji: string) {
    const el = input.current;
    const at = emojiOpen ? caret.current : null;
    const start = at?.start ?? el?.selectionStart ?? draft.length;
    const end = at?.end ?? el?.selectionEnd ?? draft.length;
    const next = (draft.slice(0, start) + emoji + draft.slice(end)).slice(0, 1000);
    setDraft(next);
    const pos = Math.min(next.length, start + emoji.length);
    caret.current = { start: pos, end: pos };
    if (emojiOpen) return;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  /** The panel's delete key: removes the character or emoji before the cursor. */
  function backspace() {
    const at = caret.current ?? { start: draft.length, end: draft.length };
    if (at.start !== at.end) {
      setDraft(draft.slice(0, at.start) + draft.slice(at.end));
      caret.current = { start: at.start, end: at.start };
      return;
    }
    if (at.start === 0) return;
    const before = Array.from(draft.slice(0, at.start));
    before.pop();
    const head = before.join("");
    setDraft(head + draft.slice(at.start));
    caret.current = { start: head.length, end: head.length };
  }

  function toggleEmoji() {
    if (emojiOpen) {
      setSheet(null);
      requestAnimationFrame(() => input.current?.focus());
      return;
    }
    const el = input.current;
    caret.current = { start: el?.selectionStart ?? draft.length, end: el?.selectionEnd ?? draft.length };
    el?.blur();
    setSheet({ mode: "compose" });
  }

  function jumpTo(id: string) {
    const el = document.querySelector<HTMLElement>(`[data-msg="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1600);
  }

  /** A message's bubble. Used in the list and, lifted, when the message is held. */
  function renderBubble(m: Placed | RoomMessage, ring = false) {
    const first = "first" in m ? m.first : true;
    const last = "last" in m ? m.last : true;
    const photoOnly = !!m.photo_path && !m.body;
    // Only emoji (1 to 3): shown large, without a bubble, like a sticker.
    if (!m.photo_path && isBigEmoji(m.body)) {
      return (
        <span className={cn("block px-1 text-[3rem] leading-none", m.pending && "opacity-70", ring && "rounded-2xl ring-2 ring-blue-400")}>
          {m.body.trim()}
        </span>
      );
    }
    return (
      <div
        className={cn(
          "overflow-hidden rounded-[1.25rem] text-[0.9375rem] leading-snug break-words whitespace-pre-wrap",
          m.mine
            ? cn(
                "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-900/15",
                !last && "rounded-br-md",
                !first && "rounded-tr-md",
                last && "rounded-br-[0.4rem]",
              )
            : cn(
                "bg-white text-ink-900 shadow-sm ring-1 ring-ink-200/70",
                !last && "rounded-bl-md",
                !first && "rounded-tl-md",
                last && "rounded-bl-[0.4rem]",
              ),
          photoOnly ? "p-0" : m.photo_path ? "pb-2" : "px-3.5 py-2",
          m.pending && "opacity-70",
          ring && "ring-2 ring-blue-400 ring-offset-2 ring-offset-paper",
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
    );
  }

  const heldMessage = held ? messages.find((x) => x.id === held.id) : undefined;
  const pinned = latestPin(messages);
  const canSend = (draft.trim().length > 0 || !!photo) && draft.trim().length <= 1000;
  const who = (m: RoomMessage | undefined) => (m?.mine ? "You" : otherName);

  return (
    <div className="flex min-h-[calc(100dvh-15rem)] flex-col md:min-h-[calc(100dvh-12rem)]">
      {pinned && (
        <button
          type="button"
          onClick={() => jumpTo(pinned.id)}
          className="glass sticky top-[calc(var(--frame-top,4.5rem)+4.25rem)] z-10 mb-2 flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2 text-left"
        >
          <Pin className="size-4 shrink-0 text-blue-700" aria-hidden />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-blue-700">Pinned</span>
            <span className="block truncate text-sm text-ink-900">{snippet(pinned)}</span>
          </span>
        </button>
      )}
      {kind === "friend" && disappear && (
        <button
          type="button"
          onClick={() => !blocked && setDisappearOpen(true)}
          disabled={blocked}
          className="mx-auto mb-1 flex max-w-full items-center gap-2 rounded-full bg-ink-100/80 px-3.5 py-1.5 text-left text-xs text-ink-700 backdrop-blur disabled:opacity-70"
        >
          <Timer className="size-3.5 shrink-0 text-blue-700" aria-hidden />
          <span className="min-w-0">
            {disappearText(disappear)}
            {setBy && <span className="text-ink-500"> {setBy === "me" ? "You set this." : `${otherName} set this.`}</span>}
            {!blocked && <span className="ml-1 font-semibold text-blue-700">Change</span>}
          </span>
        </button>
      )}
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
          const isHeld = held?.id === m.id;
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

              <div className="relative max-w-[80%]">
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`${who(m)}: ${snippet(m) || "message"}. Hold for options`}
                  aria-haspopup="dialog"
                  aria-expanded={isHeld}
                  {...holdHandlers(m, canAct)}
                  onDoubleClick={() => canAct && !blocked && react(m, "❤️")}
                  className={cn(
                    "cursor-pointer rounded-[1.25rem] transition-[transform,opacity] select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:scale-[0.98]",
                    isHeld && "opacity-0",
                  )}
                >
                  {renderBubble(m, highlight === m.id)}
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
            <button
              type="button"
              onClick={toggleEmoji}
              aria-label={emojiOpen ? "Show keyboard" : "Add an emoji"}
              aria-expanded={emojiOpen}
              className="grid size-11 shrink-0 place-items-center rounded-full text-blue-700 hover:bg-blue-50"
            >
              {emojiOpen ? <Keyboard className="size-5" aria-hidden /> : <Smile className="size-5" aria-hidden />}
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
              // Tapping the box brings the keyboard back in place of the emoji panel.
              onFocus={() => emojiOpen && setSheet(null)}
              onSelect={(e) => {
                caret.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
              }}
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
          {emojiOpen && <EmojiPanel onPick={insertEmoji} onBackspace={backspace} />}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-center text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {held && heldMessage && (
        <MessageOverlay
          rect={held.rect}
          mine={heldMessage.mine}
          preview={renderBubble(heldMessage)}
          myReaction={reactions.find((r) => r.message_id === heldMessage.id && r.user_id === me.userId)?.emoji ?? null}
          canReact={!blocked}
          canReply={!blocked}
          canCopy={!!heldMessage.body}
          pinned={!!heldMessage.pinned_at}
          onReact={(e) => react(heldMessage, e)}
          onMore={() => {
            setHeld(null);
            setSheet({ mode: "react", message: heldMessage });
          }}
          onReply={() => {
            setReplyTo(heldMessage);
            setHeld(null);
            input.current?.focus();
          }}
          onCopy={() => {
            void navigator.clipboard?.writeText(heldMessage.body);
            setHeld(null);
          }}
          onPin={() => pin(heldMessage)}
          onClose={() => setHeld(null)}
        />
      )}
      {disappearOpen && disappear && (
        <DisappearSheet current={disappear} onPick={chooseDisappear} onClose={() => setDisappearOpen(false)} />
      )}
      {sheet?.mode === "react" && (
        <EmojiSheet
          title="React with"
          onPick={(e) => react(sheet.message, e)}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

/** A sent friend-chat message's expiry, until the live row arrives with the server's own. */
function localExpiry(createdAt: string, mode: DisappearMode | undefined) {
  const hours = mode === "12h" ? 12 : mode === "seen" ? 24 * 7 : 24;
  return { expires_at: new Date(new Date(createdAt).getTime() + hours * 3_600_000).toISOString(), once: mode === "seen" };
}
