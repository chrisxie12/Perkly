import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/features/students/app/format";

/** The frosted bar at the top of a chat: back, who you're talking to, and actions on the right. */
export function RoomHeader({
  backHref,
  backLabel,
  name,
  sub,
  photo,
  nameHref,
  friend,
  children,
}: {
  backHref: string;
  backLabel: string;
  name: string;
  sub?: string;
  photo?: string | null;
  nameHref?: string;
  friend?: boolean;
  children?: React.ReactNode;
}) {
  const who = (
    <>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- public storage URL
        <img src={photo} alt="" className="size-10 shrink-0 rounded-full bg-ink-100 object-cover" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold",
            friend ? "bg-gradient-to-br from-blue-400 to-blue-600 text-white" : "bg-blue-50 text-blue-700",
          )}
        >
          {initials(name)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-bold text-ink-900">{name}</span>
        {sub && <span className="block truncate text-xs text-ink-600">{sub}</span>}
      </span>
    </>
  );
  return (
    <header className="glass sticky top-18 z-10 mb-2 flex items-center gap-1.5 rounded-full py-1.5 pr-1.5 pl-1">
      <Link
        href={backHref}
        className="grid size-11 shrink-0 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
        aria-label={backLabel}
      >
        <ChevronLeft className="size-6" aria-hidden />
      </Link>
      {nameHref ? (
        <Link href={nameHref} className="flex min-w-0 flex-1 items-center gap-2.5">
          {who}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2.5">{who}</span>
      )}
      {children}
    </header>
  );
}
