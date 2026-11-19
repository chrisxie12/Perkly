import type { Metadata } from "next";
import Link from "next/link";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { cn } from "@/lib/utils";
import { listDisputes } from "@/features/disputes/queries";
import { REASON_LABEL, STATUS_LABEL, formatWhen } from "@/features/disputes/schemas";

export const metadata: Metadata = { title: "Problem reports", robots: { index: false, follow: false } };

const FILTERS = ["open", "investigating", "resolved", "dismissed"] as const;

export default async function AdminDisputesPage({ searchParams }: PageProps<"/admin/disputes">) {
  const raw = (await searchParams).status;
  const status = FILTERS.find((f) => f === raw);
  const rows = await listDisputes(status);
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Problem reports"
        description="Reports from students and businesses about a redemption or a booking. Open ones first, oldest first."
      />
      <nav aria-label="Filter" className="mb-6 flex flex-wrap gap-2">
        {[undefined, ...FILTERS].map((f) => (
          <Link
            key={f ?? "all"}
            href={f ? `/admin/disputes?status=${f}` : "/admin/disputes"}
            aria-current={f === status ? "page" : undefined}
            className={cn("rounded-full px-4 py-2 font-semibold", f === status ? "bg-ink-900 text-white" : "bg-white ring-1 ring-ink-200")}
          >
            {f ? STATUS_LABEL[f] : "All"}
          </Link>
        ))}
      </nav>
      {rows === null ? (
        <p className="text-ink-700">Only Perqly support with two-factor can see problem reports.</p>
      ) : rows.length === 0 ? (
        <p className="text-ink-700">No reports here.</p>
      ) : (
        <ul className="grid max-w-3xl gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/disputes/${r.id}`} className="block rounded-2xl bg-white p-4 ring-1 ring-ink-200 hover:bg-ink-50">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink-900">{REASON_LABEL[r.reason] ?? r.reason}</span>
                  <span className="text-sm font-semibold text-ink-700">{STATUS_LABEL[r.status] ?? r.status}</span>
                </span>
                <span className="block text-sm text-ink-600">
                  From the {r.opened_by_party === "student" ? "student" : "business"} · {r.merchant_name} ·{" "}
                  {r.has_booking ? "booking" : "redemption"} · {formatWhen(r.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
