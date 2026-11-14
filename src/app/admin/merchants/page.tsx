import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/states";
import { listMerchantsForStaff } from "@/features/merchants/queries";
import { MERCHANT_STATUS_LABEL } from "@/features/merchants/schemas";
import { formatDate } from "@/features/students/components/status-card";

export const metadata: Metadata = { title: "Businesses", robots: { index: false, follow: false } };

export default async function AdminMerchantsPage() {
  const merchants = await listMerchantsForStaff();
  const waiting = merchants.filter((m) => m.status === "pending_review").length;
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Businesses"
        description={waiting === 0 ? "No businesses are waiting for review." : `${waiting} waiting for review, listed first.`}
      />
      {merchants.length === 0 ? (
        <EmptyState icon={<Store />} title="No businesses yet" description="Businesses appear here when they register." />
      ) : (
        <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70">
          {merchants.map((m) => (
            <li key={m.id}>
              <Link href={`/admin/merchants/${m.id}`} className="flex items-center gap-4 p-5 hover:bg-ink-50">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">{m.display_name}</span>
                    <Badge variant={m.status === "pending_review" ? "orange" : m.status === "approved" ? "success" : "outline"}>
                      {MERCHANT_STATUS_LABEL[m.status]}
                    </Badge>
                  </span>
                  <span className="mt-1 block text-sm text-ink-600">
                    {m.merchant_categories?.name ?? "No category"}, registered {formatDate(m.created_at)}
                    {m.submitted_at && m.status === "pending_review" ? `, sent ${formatDate(m.submitted_at)}` : ""}
                  </span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-blue-500" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
