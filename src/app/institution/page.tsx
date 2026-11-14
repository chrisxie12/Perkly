import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Inbox } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { getQueue, getReviewableInstitutions } from "@/features/institutions/queries";
import { formatDate } from "@/features/students/components/status-card";
import { institutionNavFor } from "./institution-nav";
import { getUserContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Verification queue", robots: { index: false } };

const decidedMessages: Record<string, string> = {
  approve: "Approved. The student now shows as verified.",
  reject: "Rejected. The student has been told why.",
  request_resubmission: "Sent back to the student with your note.",
};

function waitingFor(submittedAt: string | null) {
  if (!submittedAt) return "";
  const hours = Math.floor((Date.now() - new Date(submittedAt).getTime()) / 3_600_000);
  return hours < 1 ? "under an hour" : hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} days`;
}

export default async function InstitutionQueuePage({ searchParams }: PageProps<"/institution">) {
  const [{ decided }, queue, ctx, reviewable] = await Promise.all([
    searchParams,
    getQueue(),
    getUserContext(),
    getReviewableInstitutions(),
  ]);
  const schoolName = new Map(reviewable.map((row) => [row.institution_id, row.short_name]));
  const message = typeof decided === "string" ? decidedMessages[decided] : undefined;

  return (
    <AreaShell area="Institution reviewer" nav={institutionNavFor(ctx)}>
      <PageTitle
        title="Verification queue"
        description={
          reviewable.length > 0
            ? `Oldest first, for ${reviewable.map((row) => (row.via === "delegated" ? `${row.short_name} (for Perqly)` : row.short_name)).join(", ")}. Check the student ID and photos, then decide. Every document view is logged.`
            : "You can't review any institution at the moment. If you were just appointed, sign out and in again."
        }
      />
      {message && (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 font-medium text-success">
          <BadgeCheck className="size-5" aria-hidden /> {message}
        </p>
      )}
      {queue.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="No applications waiting"
          description="New verification applications from your institution's students appear here."
        />
      ) : (
        <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70">
          {queue.map((row) => (
            <li key={row.id}>
              <Link href={`/institution/requests/${row.id}`} className="flex items-center gap-4 p-5 hover:bg-ink-50">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink-900">
                    {row.full_name}
                    {reviewable.length > 1 && (
                      <span className="ml-2 text-sm font-medium text-ink-600">{schoolName.get(row.institution_id)}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-600">
                    {[row.programme, row.level && `Level ${row.level}`].filter(Boolean).join(", ") || "Programme not given"}
                  </span>
                  <span className="mt-1 block text-sm text-ink-600">
                    Sent {formatDate(row.submitted_at)}, waiting {waitingFor(row.submitted_at)}
                    {row.institutional_email ? " · institutional email included" : ""}
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
