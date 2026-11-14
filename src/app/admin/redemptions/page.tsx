import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, Search } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/states";
import { money } from "@/features/offers/schemas";
import { VoidForm } from "@/features/redemptions/components/void-form";
import { getRedemptionsForStaff } from "@/features/redemptions/queries";

export const metadata: Metadata = { title: "Redemptions", robots: { index: false, follow: false } };

const when = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

export default async function AdminRedemptionsPage({ searchParams }: PageProps<"/admin/redemptions">) {
  const params = await searchParams;
  const raw = typeof params.ref === "string" ? params.ref.trim().toUpperCase() : "";
  const ref = /^PQ-[0-9A-Z]{8}$/.test(raw) ? raw : undefined;
  const rows = await getRedemptionsForStaff(ref);
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Redemptions"
        description="The latest 100 completed redemptions. Void one only after a dispute; the student's savings and the offer count are reversed and the void is audited."
      />
      <form role="search" className="mb-6 flex max-w-md gap-2">
        <label htmlFor="ref" className="sr-only">
          Reference
        </label>
        <Input id="ref" name="ref" defaultValue={raw} placeholder="PQ-7K3M9Q2D" className="flex-1 font-mono uppercase" />
        <Button type="submit" variant="secondary" size="lg" aria-label="Find">
          <Search aria-hidden />
        </Button>
      </form>
      {raw && !ref && <p className="mb-4 text-ink-700">References look like PQ- followed by 8 letters and numbers.</p>}
      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title={ref ? "No redemption with that reference" : "No redemptions yet"}
          description="Completed redemptions appear here."
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink-200/70">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span>
                  <span className="flex flex-wrap items-center gap-2 font-semibold text-ink-900">
                    {r.transaction_ref} {r.voided_at && <Badge variant="outline">Voided</Badge>}
                  </span>
                  <span className="block text-sm text-ink-600">
                    {r.item_name} at{" "}
                    {r.merchants ? (
                      <Link
                        href={`/admin/merchants/${r.merchants.id}`}
                        className="font-semibold text-blue-600 underline underline-offset-2"
                      >
                        {r.merchants.display_name}
                      </Link>
                    ) : (
                      "a business"
                    )}
                    , {r.merchant_branches?.name}, {when.format(new Date(r.redeemed_at))}
                  </span>
                </span>
                <span className="text-right text-sm text-ink-700">
                  {money(r.regular_price)} − {money(r.discount_amount)} ={" "}
                  <span className="font-semibold text-ink-900">{money(r.final_price)}</span>
                </span>
              </div>
              {r.voided_at ? (
                <p className="mt-2 text-sm text-ink-700">Reason: {r.void_reason}</p>
              ) : (
                <details className="mt-3">
                  <summary className="cursor-pointer font-semibold text-blue-600">Void after a dispute</summary>
                  <div className="mt-3 max-w-md">
                    <VoidForm redemptionId={r.id} />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
