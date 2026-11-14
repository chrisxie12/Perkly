import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/states";
import { getAuditLog } from "@/features/admin/insights";
import { getUserContext } from "@/lib/auth/session";
import { canManagePlatform } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Audit log", robots: { index: false, follow: false } };

const when = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Africa/Accra" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function compact(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = JSON.stringify(value);
  return text === "{}" ? null : text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const params = await searchParams;
  const ctx = await getUserContext();
  if (!ctx || !canManagePlatform(ctx)) {
    return (
      <AreaShell area="admin">
        <PageTitle title="Not available" description="Only Perqly admins can read the audit log." />
      </AreaShell>
    );
  }
  const action = typeof params.action === "string" && /^[a-z_.]{1,60}$/.test(params.action) ? params.action : undefined;
  const entityId = typeof params.id === "string" && UUID.test(params.id.trim()) ? params.id.trim() : undefined;
  const beforeId = typeof params.before === "string" && /^\d+$/.test(params.before) ? Number(params.before) : undefined;
  const rows = await getAuditLog({ action, entityId, beforeId });
  const next = rows.length === 100 ? rows[rows.length - 1].id : null;
  const base = new URLSearchParams({ ...(action ? { action } : {}), ...(entityId ? { id: entityId } : {}) });

  return (
    <AreaShell area="admin">
      <PageTitle title="Audit log" description="Every sensitive change, newest first. Entries can't be edited or deleted." />
      <form className="mb-6 grid max-w-2xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="action">Action starts with</Label>
          <Input id="action" name="action" defaultValue={action ?? ""} placeholder="redemption." />
        </div>
        <div>
          <Label htmlFor="id">Record, business, school or person ID</Label>
          <Input id="id" name="id" defaultValue={entityId ?? ""} placeholder="UUID" className="font-mono" />
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={<ScrollText />} title="No entries" description="Nothing matches these filters." />
      ) : (
        <ol className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white ring-1 ring-ink-200/70">
          {rows.map((r) => (
            <li key={r.id} className="p-4">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-ink-900">{r.action}</span>
                <span className="text-sm text-ink-600">{when.format(new Date(r.occurred_at))}</span>
              </p>
              <p className="text-sm text-ink-700">
                {r.actor_name ?? r.actor_email ?? "System"} ({r.actor_context}) on {r.entity_type}
                {r.entity_id ? (
                  <>
                    {" "}
                    <Link href={`/admin/audit?id=${r.entity_id}`} className="font-mono text-blue-600 underline underline-offset-2">
                      {r.entity_id.slice(0, 8)}
                    </Link>
                  </>
                ) : null}
              </p>
              {[
                compact(r.before) && `Before: ${compact(r.before)}`,
                compact(r.after) && `After: ${compact(r.after)}`,
                compact(r.metadata) && `Details: ${compact(r.metadata)}`,
              ]
                .filter(Boolean)
                .map((line) => (
                  <p key={line as string} className="mt-1 font-mono text-xs break-all text-ink-600">
                    {line}
                  </p>
                ))}
            </li>
          ))}
        </ol>
      )}
      {next && (
        <Link
          href={`/admin/audit?${new URLSearchParams({ ...Object.fromEntries(base), before: String(next) })}`}
          className="mt-6 inline-block font-semibold text-blue-600 underline underline-offset-2"
        >
          Older entries
        </Link>
      )}
    </AreaShell>
  );
}
