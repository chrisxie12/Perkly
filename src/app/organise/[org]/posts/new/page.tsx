import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { getCampusEnabled, getOrganisationForEditor } from "@/features/campus/queries";
import { CampusClosed, NotManaging } from "@/features/campus/components/campus-closed";
import { PostEditor } from "@/features/campus/components/post-editor";

export const metadata: Metadata = { title: "New post", robots: { index: false } };

export default async function NewPostPage({ params }: PageProps<"/organise/[org]/posts/new">) {
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed area="organise" />;
  const org = await getOrganisationForEditor((await params).org);
  if (!org) return <NotManaging />;
  return (
    <AreaShell area="organise">
      <Link href={`/organise/${org.id}`} className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> {org.name}
      </Link>
      <PageTitle title="New post" description="It's saved as a draft. You choose when it goes live on the next screen." />
      <div className="max-w-2xl">
        <PostEditor organisationId={org.id} institutionId={org.institution_id} canPostEmergency={org.can_post_emergency} />
      </div>
    </AreaShell>
  );
}
