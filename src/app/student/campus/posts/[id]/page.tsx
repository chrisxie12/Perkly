import { Suspense } from "react";
import type { Metadata } from "next";
import { FriendsGoing } from "@/features/friends/components/friends-going";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ExternalLink, PlayCircle } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { getCampusEnabled, getEventDetail, getPostDetail, signCampusMedia } from "@/features/campus/queries";
import { formatPostTime, postKindLabel } from "@/features/campus/schemas";
import { OrganisationAvatar } from "@/features/campus/components/post-card";
import { OrganisationBadge } from "@/features/campus/components/organisation-badge";
import { PostButtons } from "@/features/campus/components/post-buttons";
import { CampusClosed } from "@/features/campus/components/campus-closed";
import { Comments } from "@/features/campus/components/comments";
import { EventBlock } from "@/features/campus/components/event-block";

export const metadata: Metadata = { title: "Campus post", robots: { index: false } };

export default async function CampusPostPage({ params }: PageProps<"/student/campus/posts/[id]">) {
  const { id } = await params;
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed />;
  const post = /^[0-9a-f-]{36}$/.test(id) ? await getPostDetail(id) : null;
  if (!post) {
    return (
      <AreaShell area="student">
        <EmptyState
          title="This post isn't available to you"
          description="It may have been removed, or it's only for verified students of another school."
          action={
            <Link href="/student/campus" className={buttonVariants({ variant: "secondary" })}>
              Back to Campus
            </Link>
          }
        />
      </AreaShell>
    );
  }
  const [images, event] = await Promise.all([signCampusMedia([post.organisation.logo_path, ...post.media]), getEventDetail(post.id)]);
  const sharePath = post.visibility === "public" ? `/campus/p/${post.id}` : `/student/campus/posts/${post.id}`;
  return (
    <AreaShell area="student">
      <Link href="/student/campus" className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> Campus
      </Link>
      <article className="max-w-2xl">
        <Link href={`/student/campus/organisations/${post.organisation.slug}`} className="flex items-center gap-3">
          <OrganisationAvatar
            name={post.organisation.name}
            url={post.organisation.logo_path ? images.get(post.organisation.logo_path) : null}
          />
          <span>
            <span className="block font-semibold text-ink-900">{post.organisation.name}</span>
            <span className="block text-sm text-ink-600">
              {postKindLabel(post.kind)} · {formatPostTime(post.publish_at)}
            </span>
          </span>
        </Link>
        <OrganisationBadge badge={post.organisation.badge} className="mt-3" />
        {post.is_emergency && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-orange-100 px-3 py-2 font-semibold text-ink-900">
            <AlertTriangle className="size-5" aria-hidden /> Emergency notice
          </p>
        )}
        <h1 className="text-display-sm mt-4 font-display font-extrabold">{post.title}</h1>
        {event && <EventBlock postId={post.id} event={event} />}
        {event && (
          <Suspense fallback={null}>
            <FriendsGoing postId={post.id} />
          </Suspense>
        )}
        <p className="mt-3 text-lg leading-relaxed whitespace-pre-line text-ink-800">{post.body}</p>
        {post.media.length > 0 && (
          <div className="mt-5 grid gap-3">
            {post.media.map((path, i) =>
              images.get(path) ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
                <img
                  key={path}
                  src={images.get(path)}
                  alt={`Image ${i + 1} of ${post.media.length}`}
                  className="w-full rounded-2xl object-cover"
                />
              ) : null,
            )}
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          {post.link_url && (
            <a href={post.link_url} target="_blank" rel="noopener noreferrer nofollow" className={buttonVariants({ variant: "secondary" })}>
              <ExternalLink aria-hidden /> Open link
            </a>
          )}
          {post.video_url && (
            <a
              href={post.video_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={buttonVariants({ variant: "secondary" })}
            >
              <PlayCircle aria-hidden /> Watch video
            </a>
          )}
        </div>
        <div className="mt-6 border-t border-ink-200 pt-3">
          <PostButtons
            postId={post.id}
            title={post.title}
            liked={post.liked ?? false}
            saved={post.saved ?? false}
            likeCount={post.like_count ?? 0}
            sharePath={sharePath}
          />
        </div>
        {enabled.comments && <Comments postId={post.id} comments={post.comments} canModerate={post.can_edit ?? false} />}
      </article>
    </AreaShell>
  );
}
