import type { Metadata } from "next";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/features/disputes/schemas";
import { ActionForm } from "@/features/campus/components/action-form";
import { closeChatReport, listChatReports } from "@/features/chat/admin";

export const metadata: Metadata = { title: "Chat reports", robots: { index: false, follow: false } };

const REASON: Record<string, string> = {
  spam: "Spam or unwanted messages",
  rude: "Rude or abusive",
  scam: "A scam, or asking for money",
  other: "Something else",
};

/** Reports students and businesses made about a chat. Open reports first. */
export default async function AdminChatReportsPage() {
  const rows = await listChatReports();
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Chat reports"
        description="Reports about a chat between a student and a business, or between friends. Open reports first."
      />
      {rows === null ? (
        <p className="text-ink-600">Only Perqly support and admins with two-step verification see chat reports.</p>
      ) : rows.length === 0 ? (
        <p className="text-ink-600">No chat reports yet.</p>
      ) : (
        <ul className="max-w-3xl space-y-3">
          {rows.map((r) => (
            <li key={r.id} className={cn("rounded-2xl bg-white p-4 ring-1", r.status === "open" ? "ring-orange-300" : "ring-ink-200")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{REASON[r.reason] ?? r.reason}</p>
                  <p className="text-sm text-ink-600">
                    {r.kind === "shop"
                      ? `${r.reporter} (${r.reporter_side}) about a chat with ${r.business ?? "a business"}`
                      : `${r.reporter} about a friend chat`}{" "}
                    · {formatWhen(r.created_at)} · {r.status === "open" ? "Open" : "Closed"}
                  </p>
                  {r.details && <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-[0.9375rem] text-ink-900">{r.details}</p>}
                </div>
                {r.status === "open" && <ActionForm action={closeChatReport} fields={{ id: r.id }} label="Close" />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
