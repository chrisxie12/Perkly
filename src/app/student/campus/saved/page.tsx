import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCampusEnabled, getSavedPosts, mediaPathsFor, signCampusMedia } from "@/features/campus/queries";
import { encodeCursor, decodeCursor } from "@/features/campus/schemas";
import { CampusClosed } from "@/features/campus/components/campus-closed";
import { PostCard } from "@/features/campus/components/post-card";

export const metadata: Metadata = { title: "Saved posts", robots: { index: false } };

export default async function SavedPostsPage({ searchParams }: PageProps<"/student/campus/saved">) {
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed />;
  const cursor = decodeCursor((await searchParams).after);
  const posts = await getSavedPosts(cursor);
  const images = await signCampusMedia(mediaPathsFor(posts));
  // Saved posts page on when they were saved, not when they were published.
  const last = posts.at(-1);
  const next = posts.length === 30 && last ? encodeCursor(last.saved_at, last.id) : null;
  return (
    <AreaShell area="student">
      <Link href="/student/campus" className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> Campus
      </Link>
      <PageTitle title="Saved posts" />
      {posts.length === 0 ? (
        <EmptyState icon={<Bookmark aria-hidden />} title="Nothing saved yet" description="Tap Save on a post to keep it here." />
      ) : (
        <ul className="space-y-4">
          {posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} href={`/student/campus/posts/${p.id}`} images={images} />
            </li>
          ))}
        </ul>
      )}
      {next && (
        <Link href={`/student/campus/saved?after=${next}`} className={cn(buttonVariants({ variant: "secondary" }), "mt-6")}>
          Older saves
        </Link>
      )}
    </AreaShell>
  );
}
