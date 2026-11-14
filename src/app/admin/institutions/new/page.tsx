import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card } from "@/components/ui/card";
import { InstitutionForm } from "@/features/admin/components/institution-form";
import { adminNav } from "../../admin-nav";

export const metadata: Metadata = { title: "Add institution", robots: { index: false, follow: false } };

export default function NewInstitutionPage() {
  return (
    <AreaShell area="Perqly staff" nav={adminNav}>
      <Link href="/admin/institutions" className="mb-6 inline-flex items-center gap-2 font-semibold text-blue-600">
        <ArrowLeft className="size-4" aria-hidden /> Institutions
      </Link>
      <PageTitle
        title="Add an institution"
        description="Start it as Hidden. Add its campuses, email domains and reviewers, then open it to students."
      />
      <Card className="max-w-2xl">
        <InstitutionForm />
      </Card>
    </AreaShell>
  );
}
