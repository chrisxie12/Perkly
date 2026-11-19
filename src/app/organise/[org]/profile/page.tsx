import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { getCampusEnabled, getOrganisationForEditor, signCampusMedia } from "@/features/campus/queries";
import { CampusClosed, NotManaging } from "@/features/campus/components/campus-closed";
import { OrganisationForm } from "@/features/campus/components/organisation-form";

export const metadata: Metadata = { title: "Organisation page", robots: { index: false } };

export default async function OrganisationProfilePage({ params }: PageProps<"/organise/[org]/profile">) {
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed area="organise" />;
  const org = await getOrganisationForEditor((await params).org);
  if (!org || !(org.my_role === "owner" || org.my_role === "admin")) return <NotManaging />;
  const logo = org.logo_path ? ((await signCampusMedia([org.logo_path])).get(org.logo_path) ?? null) : null;
  return (
    <AreaShell area="organise">
      <Link href={`/organise/${org.id}`} className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> {org.name}
      </Link>
      <PageTitle title="Organisation page" description="What students see about your organisation. Perqly sets the name and type." />
      <div className="max-w-2xl">
        <OrganisationForm organisation={org} logoUrl={logo} />
      </div>
    </AreaShell>
  );
}
