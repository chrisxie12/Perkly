import type { Metadata } from "next";
import { Flag } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { moderateReport } from "@/features/campus/actions";
import { getModerationQueue } from "@/features/campus/queries";
import { REPORT_REASONS, formatPostTime } from "@/features/campus/schemas";
import { ActionForm } from "@/features/campus/components/action-form";

export const metadata: Metadata = { title: "Campus moderation" };

const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;

export default async function ModerationPage() {
  const reports = await getModerationQueue();
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Campus moderation"
        description="Open reports, oldest first. Hiding can be undone by the organisation; removing is final. Every action is in the audit log."
      />
      {reports.length === 0 ? (
        <EmptyState
          icon={<Flag aria-hidden />}
          title="Nothing to review"
          description="New reports about Campus posts, comments and organisations appear here."
        />
      ) : (
        <ul className="space-y-4">
          {reports.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white p-5 ring-1 ring-ink-200">
              <p className="text-sm text-ink-600">
                {r.school} · {r.target_type} · {formatPostTime(r.created_at)} · {r.reports_on_target} open report
                {r.reports_on_target === 1 ? "" : "s"}
              </p>
              <p className="mt-2 font-semibold text-ink-900">{r.summary ?? "(already removed)"}</p>
              <p className="mt-1 text-ink-800">
                <span className="font-medium">{reasonLabel(r.reason)}</span>
                {r.note ? `: ${r.note}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionForm action={moderateReport} fields={{ reportId: r.id, action: "dismiss" }} label="Nothing wrong" />
                <ActionForm
                  action={moderateReport}
                  fields={{ reportId: r.id, action: "hide" }}
                  label={r.target_type === "organisation" ? "Suspend organisation" : "Hide"}
                />
                {r.target_type !== "organisation" && (
                  <ActionForm
                    action={moderateReport}
                    fields={{ reportId: r.id, action: "remove" }}
                    label="Remove for good"
                    confirm="Remove this for good?"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
