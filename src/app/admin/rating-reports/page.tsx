import type { Metadata } from "next";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/features/disputes/schemas";
import { ActionForm } from "@/features/campus/components/action-form";
import { Stars } from "@/features/reviews/components/stars";
import { listRatingReports, resolveRatingReport } from "@/features/reviews/admin";

export const metadata: Metadata = { title: "Rating reports", robots: { index: false, follow: false } };

const REASON: Record<string, string> = {
  spam: "Spam or advertising",
  rude: "Rude or hateful",
  false: "Not a real visit, or untrue",
  personal: "Shares someone's personal details",
  other: "Something else",
};

const OUTCOME: Record<string, string> = { open: "Open", hidden: "Rating hidden", kept: "Rating kept" };

/** Ratings that students or businesses reported. Open reports first. */
export default async function AdminRatingReportsPage() {
  const rows = await listRatingReports();
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Rating reports"
        description="Ratings a student or a business reported. Hiding a rating removes it for everyone and closes every report on it."
      />
      {rows === null ? (
        <p className="text-ink-600">Only Perqly support and admins with two-step verification see rating reports.</p>
      ) : rows.length === 0 ? (
        <p className="text-ink-600">No rating reports yet.</p>
      ) : (
        <ul className="max-w-3xl space-y-3">
          {rows.map((r) => (
            <li key={r.id} className={cn("rounded-2xl bg-white p-4 ring-1", r.status === "open" ? "ring-orange-300" : "ring-ink-200")}>
              <p className="font-semibold text-ink-900">{REASON[r.reason] ?? r.reason}</p>
              <p className="text-sm text-ink-600">
                Reported by {r.reporter_side === "business" ? "the business" : "a student"} about a rating of {r.business} ·{" "}
                {formatWhen(r.created_at)} · {OUTCOME[r.status]}
              </p>
              <div className="mt-2 rounded-lg bg-ink-50 px-3 py-2">
                <Stars value={r.rating} />
                <span className="sr-only">{r.rating} out of 5</span>
                <p className="mt-1 text-[0.9375rem] text-ink-900">{r.comment ?? "No comment, stars only."}</p>
              </div>
              {r.note && <p className="mt-2 text-[0.9375rem] text-ink-700">Their note: {r.note}</p>}
              {r.status === "open" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {!r.review_hidden && (
                    <ActionForm action={resolveRatingReport} fields={{ id: r.id, hide: "true" }} label="Hide rating" variant="primary" />
                  )}
                  <ActionForm action={resolveRatingReport} fields={{ id: r.id, hide: "false" }} label="Keep rating" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
