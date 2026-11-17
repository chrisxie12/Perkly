import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus, Users } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCampusEnabled, getOrganisationForEditor, getPostsForEditor, mediaPathsFor, signCampusMedia } from "@/features/campus/queries";
import { decodeCursor, encodeCursor } from "@/features/campus/schemas";
import { CampusClosed, NotManaging } from "@/features/campus/components/campus-closed";
import { OrganisationBadge } from "@/features/campus/components/organisation-badge";
import { PostCard } from "@/features/campus/components/post-card";

export const metadata: Metadata = { title: "Organisation", robots: { index: false } };

export default async function OrganisationHome({ params, searchParams }: PageProps<"/organise/[org]">) {
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed area="organise" />;
  const { org: id } = await params;
  const org = await getOrganisationForEditor(id);
  if (!org) return <NotManaging />;
  const cursor = decodeCursor((await searchParams).after);
  const posts = await getPostsForEditor(org.id, cursor);
  const images = await signCampusMedia(mediaPathsFor(posts));
  const last = posts.at(-1);
  const next = posts.length === 30 && last ? encodeCursor(last.created_at, last.id) : null;
  const manager = org.my_role === "owner" || org.my_role === "admin";
  return (
    <AreaShell area="organise">
      <PageTitle title={org.name} description={<OrganisationBadge badge={org.badge} />} />
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href={`/organise/${org.id}/posts/new`} className={buttonVariants()}>
          <Plus aria-hidden /> New post
        </Link>
        {manager && (
          <>
            <Link href={`/organise/${org.id}/profile`} className={buttonVariants({ variant: "secondary" })}>
              <Pencil aria-hidden /> Edit page
            </Link>
            <Link href={`/organise/${org.id}/members`} className={buttonVariants({ variant: "secondary" })}>
              <Users aria-hidden /> Members
            </Link>
          </>
        )}
      </div>
      {posts.length === 0 ? (
        <EmptyState title="No posts yet" description="Write your first post. It stays a draft until you publish it." />
      ) : (
        <ul className="space-y-4">
          {posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} href={`/organise/${org.id}/posts/${p.id}`} images={images} showStatus />
            </li>
          ))}
        </ul>
      )}
      {next && (
        <Link href={`/organise/${org.id}?after=${next}`} className={cn(buttonVariants({ variant: "secondary" }), "mt-6")}>
          Older posts
        </Link>
      )}
    </AreaShell>
  );
}
