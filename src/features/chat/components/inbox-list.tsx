"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Store, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/features/students/app/format";
import { filterInbox, type InboxFilter, type InboxItem } from "../inbox-model";

const ghanaDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
const time = new Intl.DateTimeFormat("en-GH", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Accra" });
const date = new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", timeZone: "Africa/Accra" });

function when(iso: string) {
  const d = new Date(iso);
  return ghanaDay(d) === ghanaDay(new Date()) ? time.format(d) : date.format(d);
}

export function InboxList({ items, showFriends }: { items: InboxItem[]; showFriends: boolean }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const shown = useMemo(() => filterInbox(items, filter, q), [items, filter, q]);
  const unreadTotal = items.reduce((n, i) => n + (i.unread > 0 ? 1 : 0), 0);
  const filters: { id: InboxFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: unreadTotal > 0 ? `Unread (${unreadTotal})` : "Unread" },
    ...(showFriends ? [{ id: "friend" as const, label: "Friends" }] : []),
    { id: "shop", label: "Businesses" },
  ];

  return (
    <div>
      <div role="search" className="glass flex h-12 items-center gap-2 rounded-full px-4 focus-within:ring-2 focus-within:ring-blue-500">
        <Search className="size-5 shrink-0 text-ink-600" aria-hidden />
        <label htmlFor="inbox-q" className="sr-only">
          Search chats
        </label>
        <input
          id="inbox-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search chats"
          className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink-900 placeholder:text-ink-600 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="grid size-8 place-items-center rounded-full text-ink-600"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Show">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "min-h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors",
              filter === f.id ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-10 text-center text-[0.9375rem] text-ink-600">
          {q ? `No chats match "${q.trim()}".` : filter === "unread" ? "You're all caught up." : "No chats here yet."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-200/70 overflow-hidden rounded-3xl bg-white ring-1 ring-ink-200/70">
          {shown.map((c) => (
            <li key={c.key}>
              <Link href={c.href} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50">
                <span className="relative shrink-0">
                  {c.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- public storage URL
                    <img src={c.photo} alt="" className="size-13 rounded-full bg-ink-100 object-cover" />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-13 place-items-center rounded-full font-display text-lg font-bold",
                        c.kind === "friend" ? "bg-gradient-to-br from-blue-400 to-blue-600 text-white" : "bg-blue-50 text-blue-700",
                      )}
                    >
                      {initials(c.title)}
                    </span>
                  )}
                  {c.kind === "shop" && (
                    <span
                      aria-hidden
                      className="absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full bg-white text-ink-700 ring-2 ring-white"
                    >
                      <Store className="size-3.5" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn("truncate text-ink-900", c.unread > 0 ? "font-bold" : "font-semibold")}>
                      {c.title}
                      <span className="sr-only">{c.kind === "shop" ? ", business" : ", friend"}</span>
                    </span>
                    <span className={cn("shrink-0 text-xs", c.unread > 0 ? "font-semibold text-blue-700" : "text-ink-600")}>
                      {when(c.at)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-3">
                    <span className={cn("truncate text-sm", c.unread > 0 ? "font-medium text-ink-900" : "text-ink-600")}>
                      {c.fromMe ? "You: " : ""}
                      {c.preview ?? "Say hi"}
                    </span>
                    {c.unread > 0 ? (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">
                        {c.unread > 99 ? "99+" : c.unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    ) : (
                      c.closed && <span className="shrink-0 text-xs font-semibold text-ink-600">Closed</span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
