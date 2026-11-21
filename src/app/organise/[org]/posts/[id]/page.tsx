import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ExternalLink, ScanLine } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { getCampusEnabled, getEventDetail, getOrganisationForEditor, getPostDetail, signCampusMedia } from "@/features/campus/queries";
import { isPinnedNow, isScheduled } from "@/features/campus/schemas";
import { CampusClosed, NotManaging } from "@/features/campus/components/campus-closed";
import { PostEditor } from "@/features/campus/components/post-editor";
import { statusLabel } from "@/features/campus/components/post-card";
import { PinForm, PublishForm, StatusButtons } from "@/features/campus/components/post-controls";
import { EventForm } from "@/features/campus/components/event-form";
import { TicketPriceForm } from "@/features/campus/components/ticket-price-form";

export const metadata: Metadata = { title: "Edit post", robots: { index: false } };

export default async function EditPostPage({ params, searchParams }: PageProps<"/organise/[org]/posts/[id]">) {
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed area="organise" />;
  const { org: orgId, id } = await params;
  const [org, post] = await Promise.all([getOrganisationForEditor(orgId), /^[0-9a-f-]{36}$/.test(id) ? getPostDetail(id) : null]);
  if (!org || !post || post.organisation.id !== org.id || !post.can_edit) return <NotManaging />;
  const [images, event] = await Promise.all([signCampusMedia(post.media), getEventDetail(post.id)]);
  const status = post.status ?? "draft";
  const scheduled = status === "published" && isScheduled(post.publish_at);
  const live = status === "published" && !scheduled;
  const saved = (await searchParams).saved === "1";
  return (
    <AreaShell area="organise">
      <Link href={`/organise/${org.id}`} className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> {org.name}
      </Link>
      <PageTitle title={post.title} description={statusLabel(status, post.publish_at)} />
      {saved && <p className="mb-6 rounded-xl bg-green-50 p-3 font-medium text-ink-900">Draft saved. Publish it when you&apos;re ready.</p>}
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="edit" className="max-w-2xl">
          <h2 id="edit" className="sr-only">
            Edit
          </h2>
          <PostEditor
            organisationId={org.id}
            institutionId={org.institution_id}
            canPostEmergency={org.can_post_emergency}
            post={post}
            previews={Object.fromEntries(images)}
          />
        </section>
        <aside className="space-y-6">
          {(status === "draft" || scheduled) && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
              <PublishForm postId={post.id} organisationId={org.id} />
            </div>
          )}
          {live && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
              <PinForm postId={post.id} organisationId={org.id} pinned={isPinnedNow(post.pinned_until)} />
            </div>
          )}
          {live && (
            <Link href={`/student/campus/posts/${post.id}`} className={buttonVariants({ variant: "secondary" })}>
              <ExternalLink aria-hidden /> See it as students do
            </Link>
          )}
          {!post.is_emergency && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
              <EventForm postId={post.id} organisationId={org.id} event={event} />
            </div>
          )}
          {!post.is_emergency && event && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
              <TicketPriceForm postId={post.id} organisationId={org.id} event={event} />
              {event.ticketed && (
                <Link href={`/organise/${org.id}/posts/${post.id}/door`} className={buttonVariants({ className: "mt-4 w-full" })}>
                  <ScanLine aria-hidden /> Door check-in
                </Link>
              )}
            </div>
          )}
          <StatusButtons postId={post.id} organisationId={org.id} status={status} scheduled={scheduled} />
        </aside>
      </div>
    </AreaShell>
  );
}
