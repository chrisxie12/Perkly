"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Bell, BellOff, Flag, MessageCircle, MoreHorizontal, Phone, Store, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { reportChat, setChatPref } from "./actions";
import type { RoomKind } from "./model";

const REASONS = [
  { value: "spam", label: "Spam or unwanted messages" },
  { value: "rude", label: "Rude or abusive" },
  { value: "scam", label: "A scam, or asking for money" },
  { value: "other", label: "Something else" },
];

/** The ⋯ menu in a chat's header: view the shop, mute, archive, report. */
export function ChatMenu({
  kind,
  chatId,
  muted: initialMuted,
  archived: initialArchived,
  viewHref,
  viewLabel,
  reportHref,
  inboxHref,
  links = [],
}: {
  kind: RoomKind;
  chatId: string;
  muted: boolean;
  archived: boolean;
  viewHref?: string;
  viewLabel?: string;
  /** Use an existing report page instead of the built-in form (friend chats). */
  reportHref?: string;
  inboxHref: string;
  /** Extra links at the top, such as Call and WhatsApp. */
  links?: { label: string; href: string; icon: "phone" | "whatsapp"; external?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(initialMuted);
  const [archived, setArchived] = useState(initialArchived);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(null), 2500);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setOpen(false);
    start(async () => {
      const r = await setChatPref(kind, chatId, next, null);
      if (!r.ok) setMuted(!next);
      flash(r.ok ? (next ? "Muted. You won't get notifications from this chat." : "Unmuted.") : "That didn't save. Try again.");
    });
  };

  const toggleArchive = () => {
    const next = !archived;
    setArchived(next);
    setOpen(false);
    start(async () => {
      const r = await setChatPref(kind, chatId, null, next);
      if (!r.ok) {
        setArchived(!next);
        flash("That didn't save. Try again.");
      } else if (next) router.push(`${inboxHref}?archived=1`);
      else flash("Moved back to your chats.");
    });
  };

  const item =
    "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[0.9375rem] font-medium text-ink-900 hover:bg-ink-100";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Chat options"
        className="grid size-11 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
      >
        <MoreHorizontal className="size-6" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="anim-pop absolute top-12 right-0 z-30 w-56 rounded-2xl bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(0,31,82,0.3)] ring-1 ring-ink-200"
        >
          {links.map((l) => (
            <a
              key={l.href}
              role="menuitem"
              href={l.href}
              className={item}
              {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {l.icon === "phone" ? (
                <Phone className="size-5 text-ink-600" aria-hidden />
              ) : (
                <MessageCircle className="size-5 text-ink-600" aria-hidden />
              )}
              {l.label}
            </a>
          ))}
          {viewHref && (
            <Link role="menuitem" href={viewHref} className={item}>
              <Store className="size-5 text-ink-600" aria-hidden /> {viewLabel ?? "View"}
            </Link>
          )}
          <button role="menuitem" type="button" onClick={toggleMute} className={item}>
            {muted ? <Bell className="size-5 text-ink-600" aria-hidden /> : <BellOff className="size-5 text-ink-600" aria-hidden />}
            {muted ? "Unmute" : "Mute"}
          </button>
          <button role="menuitem" type="button" onClick={toggleArchive} className={item}>
            {archived ? (
              <ArchiveRestore className="size-5 text-ink-600" aria-hidden />
            ) : (
              <Archive className="size-5 text-ink-600" aria-hidden />
            )}
            {archived ? "Unarchive" : "Archive"}
          </button>
          {reportHref ? (
            <Link role="menuitem" href={reportHref} className={cn(item, "text-red-700")}>
              <Flag className="size-5" aria-hidden /> Report
            </Link>
          ) : (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                setReporting(true);
              }}
              className={cn(item, "text-red-700")}
            >
              <Flag className="size-5" aria-hidden /> Report
            </button>
          )}
        </div>
      )}
      {/* Both go to the page itself: the header's glass effect would trap a fixed element inside it. */}
      {note &&
        createPortal(
          <p
            role="status"
            className="fixed inset-x-4 top-[calc(var(--frame-top,4.5rem)+4rem)] z-40 mx-auto max-w-sm rounded-2xl bg-ink-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg"
          >
            {note}
          </p>,
          document.body,
        )}
      {reporting &&
        createPortal(
          <ReportSheet
            kind={kind}
            chatId={chatId}
            onClose={() => setReporting(false)}
            onSent={() => flash("Thanks. Perqly support will look into it.")}
          />,
          document.body,
        )}
    </div>
  );
}

function ReportSheet({ kind, chatId, onClose, onSent }: { kind: RoomKind; chatId: string; onClose: () => void; onSent: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="report-title" className="font-display text-xl font-bold">
            Report this chat
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full hover:bg-ink-100"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm text-ink-600">What&apos;s wrong? Perqly support reads every report.</legend>
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={cn(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 ring-1",
                reason === r.value ? "bg-blue-50 ring-2 ring-blue-500" : "ring-ink-200",
              )}
            >
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="size-4 accent-blue-600"
              />
              <span className="text-[0.9375rem] text-ink-900">{r.label}</span>
            </label>
          ))}
        </fieldset>
        <label htmlFor="report-details" className="mt-4 block text-sm font-medium text-ink-900">
          Anything else? (optional)
        </label>
        <textarea
          id="report-details"
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
          rows={3}
          className="mt-1 w-full rounded-xl px-3 py-2 text-[0.9375rem] ring-1 ring-ink-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={!reason || pending}
          onClick={() =>
            start(async () => {
              const r = await reportChat(kind, chatId, reason ?? "", details);
              if (r.ok) {
                onClose();
                onSent();
              } else setError(r.error ?? "That didn't send. Try again.");
            })
          }
          className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl bg-red-600 font-semibold text-white disabled:bg-ink-200 disabled:text-ink-600"
        >
          {pending ? "Sending…" : "Send report"}
        </button>
      </div>
    </div>
  );
}
