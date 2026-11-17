import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ExternalLink, PlayCircle } from "lucide-react";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { getPublicPost } from "@/features/campus/posts/public";
import { formatPostTime, postKindLabel } from "@/features/campus/schemas";
import { OrganisationBadge } from "@/features/campus/components/organisation-badge";
import { OrganisationAvatar } from "@/features/campus/components/post-card";

export const metadata: Metadata = { title: "Campus post", robots: { index: false, follow: false } };

export default async function PublicPostPage({ params }: PageProps<"/campus/p/[id]">) {
  const { id } = await params;
  const result = await getPublicPost(id);
  if (!result) {
    return (
      <EmptyState
        title="This post isn't public"
        description="It may be only for verified students of its school, or it may have been removed. Sign in and verify to see your school's posts."
        action={
          <Link href="/login" className={buttonVariants()}>
            Sign in
          </Link>
        }
      />
    );
  }
  const { post, images } = result;
  return (
    <article>
      <Link href={`/campus/o/${post.organisation.school_slug}/${post.organisation.slug}`} className="flex items-center gap-3">
        <OrganisationAvatar
          name={post.organisation.name}
          url={post.organisation.logo_path ? images.get(post.organisation.logo_path) : null}
        />
        <span>
          <span className="block font-semibold text-ink-900">{post.organisation.name}</span>
          <span className="block text-sm text-ink-600">
            {post.organisation.school} · {postKindLabel(post.kind)} · {formatPostTime(post.publish_at)}
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
      <p className="mt-3 text-lg leading-relaxed whitespace-pre-line text-ink-800">{post.body}</p>
      {post.media.map((path, i) =>
        images.get(path) ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
          <img
            key={path}
            src={images.get(path)}
            alt={`Image ${i + 1} of ${post.media.length}`}
            className="mt-4 w-full rounded-2xl object-cover"
          />
        ) : null,
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        {post.link_url && (
          <a href={post.link_url} target="_blank" rel="noopener noreferrer nofollow" className={buttonVariants({ variant: "secondary" })}>
            <ExternalLink aria-hidden /> Open link
          </a>
        )}
        {post.video_url && (
          <a href={post.video_url} target="_blank" rel="noopener noreferrer nofollow" className={buttonVariants({ variant: "secondary" })}>
            <PlayCircle aria-hidden /> Watch video
          </a>
        )}
      </div>
      <p className="mt-8 rounded-xl bg-blue-50 p-4 text-ink-900">
        Posted on Perqly by {post.organisation.name}. {post.organisation.badge ? "Perqly has checked this organisation is real." : ""}
      </p>
    </article>
  );
}
