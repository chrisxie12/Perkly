import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { adminGetResource } from "@/features/resources/queries";
import { ResourceForm } from "@/features/resources/components/resource-form";
import { ResourceImages } from "@/features/resources/components/resource-images";

export const metadata: Metadata = { title: "Edit student resource", robots: { index: false, follow: false } };

const STATUS_NOTE = {
  pending: "Waiting for approval. Students can't see it yet.",
  draft: "Draft. Students can't see it yet.",
  published: "Published. Changes show to students as soon as you save.",
  archived: "Archived. Students can't see it.",
} as const;

export default async function EditResourcePage({ params, searchParams }: PageProps<"/admin/resources/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const resource = await adminGetResource(id);
  if (!resource) notFound();
  return (
    <AreaShell area="admin">
      <p className="mb-3">
        <Link href={`/admin/resources?status=${resource.status}`} className="font-semibold text-blue-600">
          ← Student resources
        </Link>
      </p>
      <PageTitle title={resource.name} description={STATUS_NOTE[resource.status]} />
      {sp.saved === "1" && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Saved as a draft.</p>}
      <ResourceImages resource={resource} />
      <ResourceForm resource={resource} />
    </AreaShell>
  );
}
