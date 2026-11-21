import Link from "next/link";
import { ChevronRight, Ticket, Users } from "lucide-react";
import { formatCedis, formatEventTime, goingLabel, type CampusEventPost } from "../schemas";

const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Africa/Accra" });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Africa/Accra" });
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

function DateTile({ at, dark = false }: { at: string; dark?: boolean }) {
  const d = new Date(at);
  return (
    <span
      className={`grid size-14 shrink-0 place-items-center rounded-2xl text-center leading-none ${dark ? "glass-dark text-white" : "bg-blue-50 text-blue-700"}`}
      aria-hidden
    >
      <span>
        <span className="block text-[0.6875rem] font-semibold uppercase">{day.format(d)}</span>
        <span className="block font-display text-2xl font-extrabold">{date.format(d)}</span>
      </span>
    </span>
  );
}

/** "Student price GH₵30" or "Free entry". */
function priceLabel(e: CampusEventPost["event"]) {
  return e.ticketed && e.student_price !== null ? `${formatCedis(e.student_price)} for students` : "Free";
}

/** The next event, big, over its own photo or a colour wash. */
export function FeaturedEvent({ post, image }: { post: CampusEventPost; image: string | null }) {
  const e = post.event;
  return (
    <Link
      href={`/student/campus/posts/${post.id}`}
      className="group relative isolate block min-h-80 overflow-hidden rounded-[2rem] bg-[#0B1220] p-4 text-white shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:min-h-96"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
        <img
          src={image}
          alt=""
          className="absolute inset-0 -z-20 size-full object-cover group-hover:scale-105 motion-safe:transition-transform motion-safe:duration-700"
        />
      ) : (
        <div aria-hidden className="absolute inset-0 -z-20">
          <div className="absolute -top-20 -left-10 size-72 rounded-full bg-orange-500/60 blur-3xl" />
          <div className="absolute -top-10 right-0 size-64 rounded-full bg-violet-500/50 blur-3xl" />
          <div className="absolute -right-10 -bottom-24 size-80 rounded-full bg-blue-600/70 blur-3xl" />
        </div>
      )}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/10 via-transparent to-black/60" />
      <p className="glass-dark inline-flex rounded-full px-3 py-1 text-xs font-semibold">Next up</p>
      <div className="glass-dark absolute inset-x-4 bottom-4 rounded-[1.75rem] p-4">
        <div className="flex items-center gap-3">
          <DateTile at={e.starts_at} dark />
          <div className="min-w-0">
            <p className="text-xs text-white/85">
              {time.format(new Date(e.starts_at))} · {post.organisation.name}
            </p>
            <p className="font-display text-xl leading-tight font-bold">{post.title}</p>
            <p className="truncate text-sm text-white/85">{e.venue}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-sm text-white/90">
            <Users className="size-4" aria-hidden /> {goingLabel(e)}
          </span>
          <span className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-bold whitespace-nowrap text-ink-900">
            {e.my_ticket ? "Your ticket" : e.ticketed ? priceLabel(e) : e.i_am_going ? "You're going" : "See event"}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** One line in "Coming up" or "Going". */
export function EventRow({ post }: { post: CampusEventPost }) {
  const e = post.event;
  const saving = e.ticketed && e.normal_price !== null && e.student_price !== null ? e.normal_price - e.student_price : 0;
  return (
    <Link
      href={e.my_ticket ? `/student/campus/tickets/${post.id}` : `/student/campus/posts/${post.id}`}
      className="press flex items-center gap-3 rounded-[1.5rem] bg-white p-3 shadow-soft ring-1 ring-ink-900/5 focus-visible:outline-2 focus-visible:outline-blue-500"
    >
      <DateTile at={e.starts_at} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink-900">{post.title}</span>
        <span className="block truncate text-sm text-ink-600">
          {formatEventTime(e.starts_at, null).split(", ")[1]} · {e.venue}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs font-semibold">
          {e.my_ticket ? (
            <span className="inline-flex items-center gap-1 text-blue-700">
              <Ticket className="size-3.5" aria-hidden /> {e.my_ticket.status === "checked_in" ? "Checked in" : "Ticket ready"}
            </span>
          ) : (
            <span className={e.ticketed ? "text-ink-900" : "text-ink-600"}>{priceLabel(e)}</span>
          )}
          {saving > 0 && !e.my_ticket && <span className="text-orange-700">Save {formatCedis(saving)}</span>}
          {!e.ticketed && e.i_am_going && <span className="text-green-800">You&apos;re going</span>}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-ink-500" aria-hidden />
    </Link>
  );
}
