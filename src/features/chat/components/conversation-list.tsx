import Link from "next/link";
import { cn } from "@/lib/utils";
import { initials } from "@/features/students/app/format";
import type { ConversationSummary } from "../queries";

const ghanaDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
const time = new Intl.DateTimeFormat("en-GH", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Accra" });
const date = new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", timeZone: "Africa/Accra" });

function when(iso: string) {
  const d = new Date(iso);
  return ghanaDay(d) === ghanaDay(new Date()) ? time.format(d) : date.format(d);
}

export function ConversationList({
  items,
  me,
  photos,
}: {
  items: ConversationSummary[];
  me: "student" | "merchant";
  photos?: Map<string, string>;
}) {
  return (
    <ul className="divide-y divide-ink-200 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/70">
      {items.map((c) => {
        const photo = photos?.get(c.id);
        return (
          <li key={c.id}>
            <Link href={c.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ink-50">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- public storage URL
                <img src={photo} alt="" className="size-12 shrink-0 rounded-full bg-ink-100 object-cover" />
              ) : (
                <span
                  aria-hidden
                  className="grid size-12 shrink-0 place-items-center rounded-full bg-blue-50 font-display font-bold text-blue-700"
                >
                  {initials(c.title)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={cn("truncate text-ink-900", c.unread > 0 ? "font-bold" : "font-semibold")}>{c.title}</span>
                  <span className={cn("shrink-0 text-xs", c.unread > 0 ? "font-semibold text-blue-700" : "text-ink-600")}>
                    {when(c.last_message_at)}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-3">
                  <span className={cn("truncate text-sm", c.unread > 0 ? "font-medium text-ink-900" : "text-ink-600")}>
                    {c.last_sender === me ? "You: " : ""}
                    {c.last_message_preview}
                  </span>
                  {c.unread > 0 && (
                    <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">
                      {c.unread > 99 ? "99+" : c.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                  {c.blocked && <span className="shrink-0 text-xs font-semibold text-ink-600">Blocked</span>}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
