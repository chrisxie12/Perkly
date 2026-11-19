import Link from "next/link";
import { AlertTriangle, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPostTime, isPinnedNow, isScheduled, postKindLabel, type CampusPost } from "../schemas";
import { OrganisationBadge } from "./organisation-badge";

export function OrganisationAvatar({ name, url, size = "md" }: { name: string; url?: string | null; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-16 rounded-2xl text-2xl" : "size-10 rounded-xl text-base";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
    <img src={url} alt="" className={cn(box, "shrink-0 object-cover ring-1 ring-ink-200")} />
  ) : (
    <span className={cn(box, "grid shrink-0 place-items-center bg-blue-50 font-display font-bold text-blue-700")} aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** A post in a list. `images` holds signed links for the logo and first image, when the reader may see them. */
export function PostCard({
  post,
  href,
  images,
  showStatus = false,
}: {
  post: CampusPost;
  href: string;
  images: Map<string, string>;
  showStatus?: boolean;
}) {
  const pinned = isPinnedNow(post.pinned_until);
  const first = post.media[0] ? images.get(post.media[0]) : undefined;
  return (
    <article
      className={cn(
        "rounded-2xl bg-white p-4 ring-1 ring-ink-200 transition-shadow hover:shadow-sm",
        post.is_emergency && "ring-2 ring-orange-400",
      )}
    >
      <div className="flex items-center gap-3">
        <OrganisationAvatar
          name={post.organisation.name}
          url={post.organisation.logo_path ? images.get(post.organisation.logo_path) : null}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-900">{post.organisation.name}</p>
          <p className="text-sm text-ink-600">
            {postKindLabel(post.kind)}
            {post.publish_at && <> · {formatPostTime(post.publish_at)}</>}
          </p>
        </div>
        {pinned && <Pin className="size-4 text-ink-600" aria-label="Pinned" />}
      </div>
      <OrganisationBadge badge={post.organisation.badge} className="mt-3" />
      {post.is_emergency && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-orange-100 px-3 py-2 text-sm font-semibold text-ink-900">
          <AlertTriangle className="size-4" aria-hidden /> Emergency notice
        </p>
      )}
      <Link href={href} className="mt-3 block rounded-lg focus-visible:outline-2 focus-visible:outline-blue-500">
        <h2 className="font-display text-lg leading-snug font-bold text-ink-900">{post.title}</h2>
        <p className="mt-1 line-clamp-3 whitespace-pre-line text-ink-700">{post.body}</p>
        {first && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
          <img src={first} alt="" className="mt-3 aspect-video w-full rounded-xl object-cover" />
        )}
      </Link>
      {showStatus && post.status && <p className="mt-3 text-sm font-medium text-ink-600">{statusLabel(post.status, post.publish_at)}</p>}
    </article>
  );
}

export function statusLabel(status: string, publishAt: string | null | undefined): string {
  if (status === "published" && isScheduled(publishAt)) return `Scheduled for ${formatPostTime(publishAt)}`;
  return { draft: "Draft", published: "Live", hidden: "Hidden", removed: "Removed" }[status] ?? status;
}
