import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, Map as MapIcon } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { listDeals, savingShare, type Deal } from "@/features/offers/queries";
import { DealMap, type MapCampus, type MapPoint } from "@/features/students/app/deal-map";
import { distanceLabel, savingLabel } from "@/features/students/app/deal-card";

export const metadata: Metadata = { title: "Map", robots: { index: false } };

export default async function DealsMapPage() {
  const deals = hasSupabaseEnv() ? await listDeals() : [];
  const supabase = hasSupabaseEnv() ? await createClient() : null;
  const branchIds = [...new Set(deals.map((d) => d.branch_id).filter((b): b is string => Boolean(b)))];
  const [locations, campusRows] = supabase
    ? await Promise.all([supabase.rpc("branch_locations", { p_branch_ids: branchIds }), supabase.rpc("my_campus_location")])
    : [{ data: [] }, { data: [] }];
  const where = new Map(
    ((locations.data ?? []) as { branch_id: string; latitude: number; longitude: number }[]).map((l) => [l.branch_id, l]),
  );
  const campusRow = ((campusRows.data ?? []) as { name: string; latitude: number; longitude: number }[])[0];
  const campus: MapCampus = campusRow ? { name: campusRow.name, latitude: campusRow.latitude, longitude: campusRow.longitude } : null;

  // One pin per branch, showing its best deal.
  const byBranch = new Map<string, Deal[]>();
  for (const d of deals) if (d.branch_id && where.has(d.branch_id)) byBranch.set(d.branch_id, [...(byBranch.get(d.branch_id) ?? []), d]);
  const points: MapPoint[] = [...byBranch.entries()].map(([branchId, list]) => {
    const best = [...list].sort((a, b) => savingShare(b) - savingShare(a))[0]!;
    const loc = where.get(branchId)!;
    return {
      branchId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      merchantName: best.merchant_name,
      saving: savingLabel(best),
      dealCount: list.length,
      href: list.length > 1 ? `/student/merchants/${best.merchant_slug}` : `/student/offers/${best.offer_id}`,
      away: distanceLabel(best.distance_m),
      open: best.has_hours ? best.open_now : null,
    };
  });
  const unplaced = new Set(deals.filter((d) => !d.branch_id || !where.has(d.branch_id)).map((d) => d.merchant_id)).size;

  return (
    <AreaShell area="student">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl leading-none font-black tracking-tight text-ink-900">Deals map</h1>
          <p className="mt-1.5 text-[0.9375rem] font-medium text-ink-600">
            {points.length === 0
              ? "No shops with deals have a location yet."
              : `${points.length} ${points.length === 1 ? "place" : "places"} with student deals${campus ? ` around ${campus.name}` : ""}. Tap a pin.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-start rounded-2xl bg-ink-100 p-1 sm:self-auto" role="group" aria-label="View">
          <Link href="/student" className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-ink-600 hover:bg-white/60">
            <LayoutGrid className="size-4" aria-hidden /> Grid
          </Link>
          <span
            aria-current="page"
            className="flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-bold text-blue-500 shadow-md"
          >
            <MapIcon className="size-4" aria-hidden /> Map
          </span>
        </div>
      </div>
      <div className="mt-5">
        <DealMap points={points} campus={campus} />
      </div>
      {unplaced > 0 && (
        <p className="mt-3 text-sm text-ink-600">
          {unplaced} {unplaced === 1 ? "shop hasn't" : "shops haven't"} pinned their location yet.{" "}
          <Link href="/student" className="font-semibold text-blue-600 underline">
            See all deals
          </Link>
        </p>
      )}
    </AreaShell>
  );
}
