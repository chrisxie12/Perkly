import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/states";
import { handleInstitutionRequest } from "@/features/admin/actions";
import { listInstitutionRequests } from "@/features/admin/queries";
import { formatDate } from "@/features/students/components/status-card";
import { getUserContext } from "@/lib/auth/session";
import { canManagePlatform } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Institution requests", robots: { index: false, follow: false } };

const statusBadge = {
  pending: { label: "Waiting", variant: "orange" },
  added: { label: "Added", variant: "success" },
  declined: { label: "Declined", variant: "outline" },
} as const;

export default async function InstitutionRequestsPage({ searchParams }: PageProps<"/admin/institutions/requests">) {
  const { show } = await searchParams;
  const all = show === "all";
  const [requests, ctx] = await Promise.all([listInstitutionRequests(all ? "all" : "pending"), getUserContext()]);
  const canManage = Boolean(ctx && canManagePlatform(ctx));

  return (
    <AreaShell area="admin">
      <Link href="/admin/institutions" className="mb-6 inline-flex items-center gap-2 font-semibold text-blue-600">
        <ArrowLeft className="size-4" aria-hidden /> Institutions
      </Link>
      <PageTitle
        title="Institution requests"
        description="Students ask for schools that aren't listed. Check the school on GTEC and its official website before adding it."
      />
      <nav aria-label="Filter requests" className="mb-5 flex gap-2">
        <Link
          href="/admin/institutions/requests"
          aria-current={!all ? "page" : undefined}
          className="rounded-full px-4 py-2 text-sm font-semibold text-ink-700 ring-1 ring-ink-300 aria-[current=page]:bg-ink-900 aria-[current=page]:text-white aria-[current=page]:ring-ink-900"
        >
          Waiting
        </Link>
        <Link
          href="/admin/institutions/requests?show=all"
          aria-current={all ? "page" : undefined}
          className="rounded-full px-4 py-2 text-sm font-semibold text-ink-700 ring-1 ring-ink-300 aria-[current=page]:bg-ink-900 aria-[current=page]:text-white aria-[current=page]:ring-ink-900"
        >
          All
        </Link>
      </nav>

      {requests.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={all ? "No requests yet" : "Nothing waiting"}
          description="When a student asks for a school that isn't listed, it shows up here."
        />
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink-200/70">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink-900">{r.institution_name}</span>
                <Badge variant={statusBadge[r.status].variant}>{statusBadge[r.status].label}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-600">
                {[r.campus_name, r.city].filter(Boolean).join(", ") || "No campus or city given"}, asked {formatDate(r.created_at)}
              </p>
              {r.admin_note && <p className="mt-2 text-[0.9375rem] text-ink-700">Note: {r.admin_note}</p>}
              {canManage && r.status === "pending" && (
                <form action={handleInstitutionRequest} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input type="hidden" name="requestId" value={r.id} />
                  <label className="flex-1">
                    <span className="sr-only">Note for this request</span>
                    <Input name="note" maxLength={300} placeholder="Note (optional), e.g. not on GTEC list" />
                  </label>
                  <div className="flex gap-2">
                    <Button type="submit" name="status" value="added" variant="secondary" size="sm">
                      Mark added
                    </Button>
                    <Button type="submit" name="status" value="declined" variant="ghost" size="sm">
                      Decline
                    </Button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
