import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, Building2, CalendarDays, Megaphone } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import {
  getCampusEnabled,
  getFeed,
  getHighlights,
  getMyEvents,
  getPublicSchoolFeed,
  getUpcomingEvents,
  mediaPathsFor,
  signCampusMedia,
} from "@/features/campus/queries";
import { signReturnedPaths } from "@/features/campus/posts/public";
import { decodeCursor, nextCursor, type CampusPost } from "@/features/campus/schemas";
import { PostCard } from "@/features/campus/components/post-card";
import { CampusClosed } from "@/features/campus/components/campus-closed";
import { EventRow, FeaturedEvent } from "@/features/campus/components/event-showcase";

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

  const view = params.view === "going" ? "going" : "upcoming";
  const [highlights, posts, upcoming, going] = await Promise.all([
    cursor ? Promise.resolve([]) : getHighlights(),
    getFeed(cursor, following),
    cursor ? Promise.resolve([]) : getUpcomingEvents(null),
    cursor ? Promise.resolve([]) : getMyEvents(),
  ]);
  const featured = upcoming[0] ?? null;
  const images = await signCampusMedia([...mediaPathsFor(highlights), ...mediaPathsFor(posts), featured?.media[0]]);
  const next = nextCursor(posts);
  const list = (view === "going" ? going : upcoming.slice(1)).slice(0, 6);
  const tab = (key: "all" | "following", label: string) => (
    <Link
      href={key === "all" ? "/student/campus" : "/student/campus?tab=following"}
      aria-current={(key === "following") === following ? "page" : undefined}
      className={cn(
        "press rounded-full px-4 py-2 text-sm font-semibold",
        (key === "following") === following ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200",
      )}
    >
      {label}
    </Link>
  );
  const seg = (key: "upcoming" | "going", label: string) => (
    <Link
      href={key === "upcoming" ? "/student/campus" : "/student/campus?view=going"}
      scroll={false}
      aria-current={view === key ? "page" : undefined}
      className={cn(
        "press rounded-full px-4 py-2 text-sm font-semibold",
        view === key ? "bg-white text-ink-900 shadow-soft" : "text-ink-700",
      )}
    >
      {label}
    </Link>
  );
  return (
    <AreaShell area="student">
      {!cursor && (
        <>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h1 className="font-display text-display-md font-extrabold tracking-tight">Campus</h1>
            <Link href="/student/campus/events" className="press text-sm font-semibold text-blue-600">
              All events
            </Link>
          </div>
          {featured ? (
            <FeaturedEvent post={featured} image={featured.media[0] ? (images.get(featured.media[0]) ?? null) : null} />
          ) : (
            <EmptyState
              icon={<CalendarDays aria-hidden />}
              title="No events coming up"
              description="When your school's organisations post events, the next one shows up here."
            />
          )}
          <section aria-labelledby="events" className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="events" className="font-display text-xl font-bold">
                {view === "going" ? "You're going" : "Coming up"}
              </h2>
              <nav aria-label="Events" className="flex rounded-full bg-ink-900/[0.06] p-1">
                {seg("upcoming", "Coming up")}
                {seg("going", "Going")}
              </nav>
            </div>
            {list.length === 0 ? (
              <p className="rounded-[1.5rem] bg-white p-4 text-ink-700 ring-1 ring-ink-900/5">
                {view === "going" ? "Events you're going to, and your tickets, show up here." : "Nothing else coming up yet."}
              </p>
            ) : (
              <ul className="space-y-2">
                {list.map((e) => (
                  <li key={e.id}>
                    <EventRow post={e} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <nav className="mt-6 mb-8 flex gap-2 overflow-x-auto" aria-label="Campus">
            <Link
              href="/student/campus/organisations"
              className="glass press flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 font-medium"
            >
              <Building2 className="size-5 text-blue-600" aria-hidden /> Organisations
            </Link>
            <Link
              href="/student/campus/saved"
              className="glass press flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 font-medium"
            >
              <Bookmark className="size-5 text-blue-600" aria-hidden /> Saved posts
            </Link>
          </nav>
        </>
      )}
      {highlights.length > 0 && (
        <section aria-labelledby="highlights" className="mb-8">
          <h2 id="highlights" className="mb-3 font-display text-xl font-bold">
            Pinned and urgent
          </h2>
          <PostList posts={highlights} images={images} />
        </section>
      )}
      <h2 className="mb-3 font-display text-xl font-bold">Latest from campus</h2>
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
