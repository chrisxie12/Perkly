import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { getCampusEnabled, getMyOrganisations, signCampusMedia } from "@/features/campus/queries";
import { orgKindLabel } from "@/features/campus/schemas";
import { CampusClosed } from "@/features/campus/components/campus-closed";
import { OrganisationBadge } from "@/features/campus/components/organisation-badge";
import { OrganisationAvatar } from "@/features/campus/components/post-card";

export const metadata: Metadata = { title: "Your organisations", robots: { index: false } };

export default async function OrganiseHome() {
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed area="organise" />;
  const orgs = await getMyOrganisations();
  const images = await signCampusMedia(orgs.map((o) => o.logo_path));
  return (
    <AreaShell area="organise">
      <PageTitle title="Your organisations" description="Post announcements and keep your organisation's page up to date." />
      {orgs.length === 0 ? (
        <EmptyState
          icon={<Building2 aria-hidden />}
          title="No organisations"
          description="When Perqly or an owner adds you to an organisation, it appears here."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link
                href={`/organise/${o.id}`}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-200 hover:bg-ink-50"
              >
                <OrganisationAvatar name={o.name} url={o.logo_path ? images.get(o.logo_path) : null} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-900">{o.name}</span>
                  <span className="block text-sm text-ink-600">
                    {orgKindLabel(o.kind)} · {{ owner: "Owner", admin: "Admin", editor: "Editor" }[o.role] ?? o.role}
                    {o.title ? ` · ${o.title}` : ""}
                  </span>
                  {o.live ? (
                    <OrganisationBadge badge={o.badge} className="mt-2" />
                  ) : (
                    <span className="mt-2 block text-sm font-medium text-ink-600">Not live: students can&apos;t see it right now</span>
                  )}
                </span>
                <ChevronRight className="size-5 text-ink-600" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
