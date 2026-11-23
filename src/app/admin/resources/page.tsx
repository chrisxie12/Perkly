import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Plus, Star } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ActionForm } from "@/features/campus/components/action-form";
import { setResourceFeatured, setResourceStatus } from "@/features/resources/actions";
import { categoryShort, formatCheckedOn, STATUSES, type ResourceStatus } from "@/features/resources/model";
import { adminListResources } from "@/features/resources/queries";
import { EligibilityTag, OfferPill } from "@/features/resources/components/bits";

export const metadata: Metadata = { title: "Student resources", robots: { index: false, follow: false } };

const TAB_LABEL: Record<ResourceStatus, string> = {
  pending: "Waiting for approval",
  draft: "Drafts",
  published: "Published",
  archived: "Archived",
};

export default async function AdminResourcesPage({ searchParams }: PageProps<"/admin/resources">) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(String(sp.status)) ? (sp.status as ResourceStatus) : "pending";
  const all = await adminListResources();
  if (all === null) {
    return (
      <AreaShell area="admin">
        <PageTitle title="Not available" description="Only Perqly admins with two-factor sign-in manage student resources." />
      </AreaShell>
    );
  }
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((r) => r.status === s).length])) as Record<ResourceStatus, number>;
  const list = all.filter((r) => r.status === status);
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Student resources"
        description="Free tools, student plans and opportunities shown to students. Check each one against an official source before approving it. Every change is written to the audit log."
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/resources?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-2 text-sm font-semibold",
              s === status ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50",
            )}
          >
            {TAB_LABEL[s]} ({counts[s]})
          </Link>
        ))}
        <Link href="/admin/resources/new" className={cn(buttonVariants({ size: "sm" }), "ml-auto gap-1.5")}>
          <Plus className="size-4" aria-hidden /> Add resource
        </Link>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl bg-ink-50 p-5 text-ink-700">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-ink-900">
                    {r.featured && <Star className="size-4 fill-orange-500 text-orange-500" aria-label="Featured" />}
                    <Link href={`/admin/resources/${r.id}`} className="hover:underline">
                      {r.name}
                    </Link>
                  </p>
                  <p className="text-sm text-ink-600">
                    {r.provider} · {categoryShort(r.category)}
                  </p>
                  <p className="mt-1 text-sm text-ink-700">{r.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <OfferPill resource={r} />
                    <EligibilityTag resource={r} />
                    {!r.checked_on && <span className="text-[0.8125rem] font-semibold text-red-700">Not checked yet</span>}
                    <a
                      href={r.source_url ?? r.official_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-blue-700"
                    >
                      {r.source_url ? "Source" : "Official site"} <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(r.status === "pending" || r.status === "draft") && (
                    <ActionForm
                      action={setResourceStatus}
                      fields={{ id: r.id, status: "published" }}
                      label="Approve and publish"
                      variant="primary"
                      confirm={`Publish “${r.name}” to students?${r.eligibility === "confirmed" ? ` Eligibility was checked ${formatCheckedOn(r.checked_on)}.` : " It will show as “Needs verification”."}`}
                    />
                  )}
                  {r.status === "published" && (
                    <ActionForm
                      action={setResourceFeatured}
                      fields={{ id: r.id, featured: r.featured ? "0" : "1" }}
                      label={r.featured ? "Unfeature" : "Feature"}
                    />
                  )}
                  {r.status !== "archived" ? (
                    <ActionForm
                      action={setResourceStatus}
                      fields={{ id: r.id, status: "archived" }}
                      label="Archive"
                      confirm={`Archive “${r.name}”? Students won't see it.`}
                    />
                  ) : (
                    <ActionForm action={setResourceStatus} fields={{ id: r.id, status: "draft" }} label="Restore to drafts" />
                  )}
                  <Link href={`/admin/resources/${r.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    Edit
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
