import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronLeft, Search } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getCampusEnabled, getDirectory, signCampusMedia } from "@/features/campus/queries";
import { signReturnedPaths } from "@/features/campus/posts/public";
import { orgKindLabel } from "@/features/campus/schemas";
import { CampusClosed } from "@/features/campus/components/campus-closed";
import { OrganisationAvatar } from "@/features/campus/components/post-card";
import { OrganisationBadge } from "@/features/campus/components/organisation-badge";

export const metadata: Metadata = { title: "Campus organisations", robots: { index: false } };

function directoryCursor(value: unknown): { name: string; id: string } | null {
  if (typeof value !== "string" || value.length > 400) return null;
  try {
    const c = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return typeof c?.name === "string" && /^[0-9a-f-]{36}$/.test(c?.id) ? { name: c.name, id: c.id } : null;
  } catch {
    return null;
  }
}

export default async function OrganisationsPage({ searchParams }: PageProps<"/student/campus/organisations">) {
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed />;
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const directory = await getDirectory(q || null, directoryCursor(params.after));
  // Verified students sign logos with their own access; others see logos of live organisations, which are public pages.
  const logos = directory.items.map((o) => o.logo_path);
  const images = directory.full ? await signCampusMedia(logos) : await signReturnedPaths(logos);
  const last = directory.items.at(-1);
  const next =
    directory.items.length === 30 && last
      ? Buffer.from(JSON.stringify({ name: last.name, id: last.id }), "utf8").toString("base64url")
      : null;
  return (
    <AreaShell area="student">
      <Link href="/student/campus" className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> Campus
      </Link>
      <PageTitle title="Organisations" description="The SRC, faculties, departments, halls, clubs and societies at your school." />
      <form className="mb-6 flex gap-2" role="search">
        <label htmlFor="org-search" className="sr-only">
          Search organisations
        </label>
        <Input id="org-search" name="q" defaultValue={q} placeholder="Search by name" />
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          <Search aria-hidden /> Search
        </button>
      </form>
      {directory.items.length === 0 ? (
        <EmptyState
          icon={<Building2 aria-hidden />}
          title={q ? "No organisations match" : "No organisations yet"}
          description={q ? "Try a shorter name." : "Organisations appear here once Perqly verifies them."}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {directory.items.map((o) => (
            <li key={o.id}>
              <Link
                href={directory.full ? `/student/campus/organisations/${o.slug}` : `/campus/o/${o.school_slug}/${o.slug}`}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-200 hover:bg-ink-50"
              >
                <OrganisationAvatar name={o.name} url={o.logo_path ? images.get(o.logo_path) : null} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-900">{o.name}</span>
                  <span className="block text-sm text-ink-600">{orgKindLabel(o.kind)}</span>
                  <OrganisationBadge badge={o.badge} className="mt-2" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {next && (
        <Link
          href={`/student/campus/organisations?${q ? `q=${encodeURIComponent(q)}&` : ""}after=${next}`}
          className={cn(buttonVariants({ variant: "secondary" }), "mt-6")}
        >
          More organisations
        </Link>
      )}
    </AreaShell>
  );
}
