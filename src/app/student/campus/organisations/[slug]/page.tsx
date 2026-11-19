import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Mail, Phone } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCampusEnabled, getOrganisationPosts, getOrganisationProfile, mediaPathsFor, signCampusMedia } from "@/features/campus/queries";
import { decodeCursor, nextCursor, orgKindLabel } from "@/features/campus/schemas";
import { CampusClosed } from "@/features/campus/components/campus-closed";
import { FollowButton } from "@/features/campus/components/follow-button";
import { OrganisationBadge } from "@/features/campus/components/organisation-badge";
import { OrganisationAvatar, PostCard } from "@/features/campus/components/post-card";
import { ReportDialog } from "@/features/campus/components/post-buttons";

export const metadata: Metadata = { title: "Organisation", robots: { index: false } };

export default async function OrganisationPage({ params, searchParams }: PageProps<"/student/campus/organisations/[slug]">) {
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed />;
  const { slug } = await params;
  const org = /^[a-z0-9-]{2,64}$/.test(slug) ? await getOrganisationProfile(slug) : null;
  if (!org) {
    return (
      <AreaShell area="student">
        <EmptyState
          title="This organisation isn't available to you"
          description="Only verified students of its school can see its full page."
          action={
            <Link href="/student/campus/organisations" className={buttonVariants({ variant: "secondary" })}>
              All organisations
            </Link>
          }
        />
      </AreaShell>
    );
  }
  const cursor = decodeCursor((await searchParams).after);
  const posts = cursor ? await getOrganisationPosts(org.id, cursor) : org.posts;
  const images = await signCampusMedia([org.logo_path, ...mediaPathsFor(posts)]);
  const next = nextCursor(posts);
  return (
    <AreaShell area="student">
      <Link href="/student/campus/organisations" className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> Organisations
      </Link>
      <header className="flex flex-wrap items-start gap-4">
        <OrganisationAvatar name={org.name} url={org.logo_path ? images.get(org.logo_path) : null} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-display-sm font-display font-extrabold">{org.name}</h1>
          <p className="text-ink-600">{orgKindLabel(org.kind)}</p>
          <OrganisationBadge badge={org.badge} className="mt-2" />
        </div>
        <FollowButton organisationId={org.id} following={org.following} name={org.name} />
      </header>
      {org.description && <p className="mt-5 max-w-2xl whitespace-pre-line text-ink-800">{org.description}</p>}
      {(org.contact_email || org.contact_phone) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {org.contact_email && (
            <a href={`mailto:${org.contact_email}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <Mail aria-hidden /> {org.contact_email}
            </a>
          )}
          {org.contact_phone && (
            <a href={`tel:${org.contact_phone.replace(/\s/g, "")}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <Phone aria-hidden /> {org.contact_phone}
            </a>
          )}
        </div>
      )}
      {org.representatives.length > 0 && (
        <section className="mt-8" aria-labelledby="reps">
          <h2 id="reps" className="font-display text-lg font-bold">
            Representatives
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {org.representatives.map((r, i) => (
              <li key={i} className="rounded-xl bg-white p-3 ring-1 ring-ink-200">
                <span className="block font-medium text-ink-900">{r.name ?? "Member"}</span>
                {r.title && <span className="block text-sm text-ink-600">{r.title}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="mt-8" aria-labelledby="posts">
        <h2 id="posts" className="mb-3 font-display text-lg font-bold">
          Posts
        </h2>
        {posts.length === 0 ? (
          <p className="text-ink-600">No posts yet.</p>
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
          <Link
            href={`/student/campus/organisations/${org.slug}?after=${next}`}
            className={cn(buttonVariants({ variant: "secondary" }), "mt-6")}
          >
            Older posts
          </Link>
        )}
      </section>
      <div className="mt-8">
        <ReportDialog targetType="organisation" targetId={org.id} />
      </div>
    </AreaShell>
  );
}
