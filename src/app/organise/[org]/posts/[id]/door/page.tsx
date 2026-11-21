import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { getCampusEnabled, getEventDetail, getOrganisationForEditor, getPostDetail, getTicketStats } from "@/features/campus/queries";
import { formatCedis, formatEventTime } from "@/features/campus/schemas";
import { CampusClosed, NotManaging } from "@/features/campus/components/campus-closed";
import { DoorCheck } from "@/features/campus/components/door-check";

export const metadata: Metadata = { title: "Door check-in", robots: { index: false } };

/** Organisers check ticket holders in at the door. Opens 24 hours before the event. */
export default async function DoorPage({ params }: PageProps<"/organise/[org]/posts/[id]/door">) {
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed area="organise" />;
  const { org: orgId, id } = await params;
  const [org, post] = await Promise.all([getOrganisationForEditor(orgId), /^[0-9a-f-]{36}$/.test(id) ? getPostDetail(id) : null]);
  if (!org || !post || post.organisation.id !== org.id || !post.can_edit) return <NotManaging />;
  const [event, stats] = await Promise.all([getEventDetail(post.id), getTicketStats(post.id)]);
  const back = (
    <Link href={`/organise/${org.id}/posts/${post.id}`} className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
      <ChevronLeft className="size-5" aria-hidden /> {post.title}
    </Link>
  );
  if (!event?.ticketed || event.normal_price === null || event.student_price === null) {
    return (
      <AreaShell area="organise">
        {back}
        <PageTitle title="Door check-in" description="Set ticket prices on the event first. Then ticket holders can be checked in here." />
      </AreaShell>
    );
  }
  return (
    <AreaShell area="organise">
      {back}
      <PageTitle
        title="Door check-in"
        description={`${formatEventTime(event.starts_at, event.ends_at)} · ${event.venue}. Students pay ${formatCedis(event.student_price)} (normally ${formatCedis(event.normal_price)}).`}
      />
      <div className="mx-auto max-w-md">
        {stats && (
          <p className="mb-5 text-ink-700">
            <span className="font-semibold text-ink-900">{stats.checked_in}</span> checked in ·{" "}
            <span className="font-semibold text-ink-900">{stats.active}</span> still to come
          </p>
        )}
        {stats?.door_open === false ? (
          <p className="rounded-2xl bg-blue-50 p-4 text-ink-900">
            {event.over ? "This event has ended, so check-in is closed." : "Check-in opens 24 hours before the event starts."}
          </p>
        ) : (
          <DoorCheck postId={post.id} />
        )}
      </div>
    </AreaShell>
  );
}
