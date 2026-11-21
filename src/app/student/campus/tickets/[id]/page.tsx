import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { BadgeCheck, CalendarDays, ChevronLeft, MapPin } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { getCampusEnabled, getEventDetail, getPostDetail } from "@/features/campus/queries";
import { formatCedis, formatEventTime, formatTicketCode, savingLabel } from "@/features/campus/schemas";
import { CampusClosed } from "@/features/campus/components/campus-closed";
import { getMyPassPhotoPath, signPassPhoto } from "@/features/pass-photo/server";

export const metadata: Metadata = { title: "Your ticket", robots: { index: false } };

/** The student's ticket: a QR with the code, their photo, and the price to pay at the door. */
export default async function TicketPage({ params }: PageProps<"/student/campus/tickets/[id]">) {
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [post, event, ctx, photoPath] = await Promise.all([getPostDetail(id), getEventDetail(id), getUserContext(), getMyPassPhotoPath()]);
  const ticket = event?.my_ticket;
  if (!post || !event || !ticket) notFound();
  const [qr, photo] = await Promise.all([
    QRCode.toString(ticket.code, { type: "svg", errorCorrectionLevel: "M", margin: 2 }),
    signPassPhoto(photoPath, 600),
  ]);
  const name = ctx?.fullName ?? ctx?.firstName ?? "Student";
  const inside = ticket.status === "checked_in";
  return (
    <AreaShell area="student">
      <Link href={`/student/campus/posts/${post.id}`} className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> Event
      </Link>
      <article className="mx-auto max-w-sm overflow-hidden rounded-[2rem] bg-[#0B1220] text-white shadow-lift">
        <div className="relative isolate p-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-16 -right-10 size-56 rounded-full bg-blue-500/50 blur-3xl" />
            <div className="absolute -bottom-20 -left-10 size-56 rounded-full bg-orange-500/40 blur-3xl" />
          </div>
          <p className="text-sm font-semibold text-white/80">{post.organisation.name}</p>
          <h1 className="mt-1 font-display text-2xl leading-tight font-extrabold">{post.title}</h1>
          <p className="mt-3 flex items-start gap-2 text-sm text-white/90">
            <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden /> {formatEventTime(event.starts_at, event.ends_at)}
          </p>
          <p className="mt-1 flex items-start gap-2 text-sm text-white/90">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {event.venue}
          </p>
        </div>
        <div className="relative border-t border-dashed border-white/25 bg-white p-6 text-ink-900">
          <span aria-hidden className="absolute -top-3 -left-3 size-6 rounded-full bg-paper" />
          <span aria-hidden className="absolute -top-3 -right-3 size-6 rounded-full bg-paper" />
          {inside ? (
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-green-50 p-6 font-display text-xl font-bold" role="status">
              <BadgeCheck className="size-7 text-success" aria-hidden /> You&apos;re in. Enjoy!
            </p>
          ) : (
            <div
              role="img"
              aria-label={`Ticket QR code. Code ${formatTicketCode(ticket.code)}`}
              className="mx-auto w-56 [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          )}
          <p className="mt-3 text-center font-mono text-xl font-bold tracking-[0.3em]">{formatTicketCode(ticket.code)}</p>
          <div className="mt-5 flex items-center gap-3">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img src={photo} alt="" className="size-12 rounded-full object-cover" />
            ) : (
              <span className="grid size-12 place-items-center rounded-full bg-blue-50 font-display font-bold text-blue-700" aria-hidden>
                {name.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{name}</p>
              <p className="text-sm text-ink-700">Verified student</p>
            </div>
            <div className="text-right">
              <p className="font-display text-xl font-extrabold">{formatCedis(ticket.student_price)}</p>
              <p className="text-xs text-ink-700 line-through">{formatCedis(ticket.normal_price)}</p>
            </div>
          </div>
          {!inside && (
            <p className="mt-5 rounded-2xl bg-blue-50 p-3 text-sm text-ink-900">
              At the door, show this QR and pay {formatCedis(ticket.student_price)}.{" "}
              {savingLabel(ticket.normal_price, ticket.student_price)}.
            </p>
          )}
        </div>
      </article>
    </AreaShell>
  );
}
