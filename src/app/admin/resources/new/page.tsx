import type { Metadata } from "next";
import Link from "next/link";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { ResourceForm } from "@/features/resources/components/resource-form";

export const metadata: Metadata = { title: "Add a student resource", robots: { index: false, follow: false } };

export default function NewResourcePage() {
  return (
    <AreaShell area="admin">
      <p className="mb-3">
        <Link href="/admin/resources" className="font-semibold text-blue-600">
          ← Student resources
        </Link>
      </p>
      <PageTitle
        title="Add a student resource"
        description="It's saved as a draft. Approve it from the list when you've checked it against an official source."
      />
      <ResourceForm />
    </AreaShell>
  );
}
