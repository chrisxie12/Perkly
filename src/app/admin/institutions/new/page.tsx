import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card } from "@/components/ui/card";
import { InstitutionForm } from "@/features/admin/components/institution-form";
import { getUserContext } from "@/lib/auth/session";
import { canManagePlatform } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Add institution", robots: { index: false, follow: false } };

export default async function NewInstitutionPage() {
  const ctx = await getUserContext();
  if (!ctx || !canManagePlatform(ctx)) {
    return (
      <AreaShell area="admin">
        <PageTitle title="Only Perqly admins can add institutions" description="Ask a Perqly admin if a school needs adding." />
      </AreaShell>
    );
  }
  return (
    <AreaShell area="admin">
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
