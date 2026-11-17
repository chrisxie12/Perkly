import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, Building2, ChevronRight, Megaphone } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { getCampusEnabled, getFeed, getHighlights, getPublicSchoolFeed, mediaPathsFor, signCampusMedia } from "@/features/campus/queries";
import { signReturnedPaths } from "@/features/campus/posts/public";
import { decodeCursor, nextCursor, type CampusPost } from "@/features/campus/schemas";
import { PostCard } from "@/features/campus/components/post-card";
import { CampusClosed } from "@/features/campus/components/campus-closed";

export const metadata: Metadata = { title: "Campus", robots: { index: false } };

function PostList({ posts, images }: { posts: CampusPost[]; images: Map<string, string> }) {
  return (
    <ul className="space-y-4">
      {posts.map((p) => (
        <li key={p.id}>
          <PostCard post={p} href={`/student/campus/posts/${p.id}`} images={images} />
        </li>
      ))}
    </ul>
  );
}

export default async function CampusPage({ searchParams }: PageProps<"/student/campus">) {
  const [enabled, status] = await Promise.all([getCampusEnabled(), getMyStudentStatus()]);
  if (!enabled.posts) return <CampusClosed />;
  const params = await searchParams;
  const cursor = decodeCursor(params.after);
  const following = params.tab === "following";
  const verified = verificationView(status) === "verified";

  if (!verified) {
    // Signed in but not verified: the declared school's public posts only (detail 5).
    const posts = await getPublicSchoolFeed(cursor);
    const images = await signReturnedPaths(mediaPathsFor(posts));
    const next = nextCursor(posts);
    return (
      <AreaShell area="student">
        <PageTitle title="Campus" description="Announcements and news from your school's organisations." />
        <div className="mb-6 rounded-2xl bg-blue-50 p-4 text-ink-900">
          <p className="font-semibold">Verify to see your school&apos;s posts</p>
          <p className="mt-1 text-ink-700">Until then you can see posts your school&apos;s organisations have made public.</p>
          <Link href="/student/verify" className={cn(buttonVariants({ size: "sm" }), "mt-3")}>
            Verify your student status
          </Link>
        </div>
        {posts.length === 0 ? (
          <EmptyState
            icon={<Megaphone aria-hidden />}
            title="No public posts yet"
            description="Public posts from your school appear here."
          />
        ) : (
          <PostList posts={posts} images={images} />
        )}
        {next && (
          <Link href={`/student/campus?after=${next}`} className={cn(buttonVariants({ variant: "secondary" }), "mt-6")}>
            Older posts
          </Link>
        )}
      </AreaShell>
    );
  }

  const [highlights, posts] = await Promise.all([cursor ? Promise.resolve([]) : getHighlights(), getFeed(cursor, following)]);
  const images = await signCampusMedia([...mediaPathsFor(highlights), ...mediaPathsFor(posts)]);
  const next = nextCursor(posts);
  const tab = (key: "all" | "following", label: string) => (
    <Link
      href={key === "all" ? "/student/campus" : "/student/campus?tab=following"}
      aria-current={(key === "following") === following ? "page" : undefined}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-semibold",
        (key === "following") === following ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200",
      )}
    >
      {label}
    </Link>
  );
  return (
    <AreaShell area="student">
      <PageTitle title="Campus" description="Announcements and news from your school's organisations." />
      <nav className="mb-6 grid gap-2 sm:grid-cols-2" aria-label="Campus">
        <Link
          href="/student/campus/organisations"
          className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-ink-200 hover:bg-ink-50"
        >
          <Building2 className="size-5 text-blue-600" aria-hidden />
          <span className="flex-1 font-medium">Organisations</span>
          <ChevronRight className="size-5 text-ink-600" aria-hidden />
        </Link>
        <Link href="/student/campus/saved" className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-ink-200 hover:bg-ink-50">
          <Bookmark className="size-5 text-blue-600" aria-hidden />
          <span className="flex-1 font-medium">Saved posts</span>
          <ChevronRight className="size-5 text-ink-600" aria-hidden />
        </Link>
      </nav>
      {highlights.length > 0 && (
        <section aria-labelledby="highlights" className="mb-8">
          <h2 id="highlights" className="mb-3 font-display text-xl font-bold">
            Pinned and urgent
          </h2>
          <PostList posts={highlights} images={images} />
        </section>
      )}
      <div className="mb-4 flex gap-2">
        {tab("all", "All posts")}
        {tab("following", "Following")}
      </div>
      {posts.length === 0 ? (
        <EmptyState
          icon={<Megaphone aria-hidden />}
          title={following ? "Nothing from organisations you follow" : "No posts yet"}
          description={
            following ? "Follow organisations to see their posts here." : "When your school's organisations post, it shows up here."
          }
          action={
            <Link href="/student/campus/organisations" className={buttonVariants({ variant: "secondary" })}>
              Find organisations
            </Link>
          }
        />
      ) : (
        <PostList posts={posts} images={images} />
      )}
      {next && (
        <Link
          href={`/student/campus?${following ? "tab=following&" : ""}after=${next}`}
          className={cn(buttonVariants({ variant: "secondary" }), "mt-6")}
        >
          Older posts
        </Link>
      )}
    </AreaShell>
  );
}
