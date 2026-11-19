import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPublicOrganisation } from "@/features/campus/posts/public";
import { encodeCursor, formatPostTime, orgKindLabel, postKindLabel } from "@/features/campus/schemas";
import { OrganisationBadge } from "@/features/campus/components/organisation-badge";
import { OrganisationAvatar } from "@/features/campus/components/post-card";

export const metadata: Metadata = { title: "Organisation", robots: { index: false, follow: false } };

export default async function PublicOrganisationPage({ params, searchParams }: PageProps<"/campus/o/[school]/[org]">) {
  const { school, org: slug } = await params;
  const valid = /^[a-z0-9-]{2,64}$/;
  const result = valid.test(school) && valid.test(slug) ? await getPublicOrganisation(school, slug, (await searchParams).after) : null;
  if (!result) {
    return <EmptyState title="This organisation isn't available" description="It may not be on Perqly yet, or the link may be wrong." />;
  }
  const { organisation: o, images } = result;
  const last = o.posts.at(-1);
  const next = o.posts.length === 30 && last ? encodeCursor(last.publish_at, last.id) : null;
  return (
    <>
      <header className="flex items-start gap-4">
        <OrganisationAvatar name={o.name} url={o.logo_path ? images.get(o.logo_path) : null} size="lg" />
        <div>
          <h1 className="text-display-sm font-display font-extrabold">{o.name}</h1>
          <p className="text-ink-600">
            {orgKindLabel(o.kind)} · {o.school}
          </p>
          <OrganisationBadge badge={o.badge} className="mt-2" />
        </div>
      </header>
      {o.description && <p className="mt-5 whitespace-pre-line text-ink-800">{o.description}</p>}
      {(o.contact_email || o.contact_phone) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {o.contact_email && (
            <a href={`mailto:${o.contact_email}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <Mail aria-hidden /> {o.contact_email}
            </a>
          )}
          {o.contact_phone && (
            <a href={`tel:${o.contact_phone.replace(/\s/g, "")}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <Phone aria-hidden /> {o.contact_phone}
            </a>
          )}
        </div>
      )}
      <section className="mt-8" aria-labelledby="public-posts">
        <h2 id="public-posts" className="mb-3 font-display text-lg font-bold">
          Public posts
        </h2>
        {o.posts.length === 0 ? (
          <p className="text-ink-600">No public posts yet. Students of {o.school} see more after signing in.</p>
        ) : (
          <ul className="space-y-3">
            {o.posts.map((p) => (
              <li key={p.id}>
                <Link href={`/campus/p/${p.id}`} className="block rounded-2xl bg-white p-4 ring-1 ring-ink-200 hover:bg-ink-50">
                  <span className="block text-sm text-ink-600">
                    {postKindLabel(p.kind)} · {formatPostTime(p.publish_at)}
                  </span>
                  <span className="mt-1 block font-semibold text-ink-900">{p.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {next && (
          <Link
            href={`/campus/o/${o.school_slug}/${o.slug}?after=${next}`}
            className={cn(buttonVariants({ variant: "secondary" }), "mt-6")}
          >
            Older posts
          </Link>
        )}
      </section>
    </>
  );
}
