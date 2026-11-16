import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, Map as MapIcon } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { listDeals, savingShare, type Deal } from "@/features/offers/queries";
import { openLabel } from "@/features/merchants/hours";
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
      dealTitle: best.title,
      categorySlug: best.category_slug,
      categoryName: best.category_name,
      categoryIcon: best.category_icon,
      photo: best.cover_url ?? null,
      rating: best.rating ?? null,
      openText: openLabel(best)?.text ?? null,
      href: list.length > 1 ? `/student/merchants/${best.merchant_slug}` : `/student/offers/${best.offer_id}`,
      away: distanceLabel(best.distance_m),
      open: best.has_hours ? best.open_now : null,
    };
  });
  const unplaced = new Set(deals.filter((d) => !d.branch_id || !where.has(d.branch_id)).map((d) => d.merchant_id)).size;

  return (
    <AreaShell area="student">
      <div className="-mt-2 mb-3 flex items-center justify-between gap-3 md:mt-0">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight font-black tracking-tight text-ink-900">Deals map</h1>
          <p className="truncate text-sm font-medium text-ink-600">
            {points.length === 0
              ? "No pinned shops yet"
              : `${points.length} ${points.length === 1 ? "place" : "places"}${campus ? ` around ${campus.name}` : ""}`}
            {unplaced > 0 ? ` · ${unplaced} not pinned yet` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-2xl bg-ink-100 p-1" role="group" aria-label="View">
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
      <DealMap points={points} campus={campus} />
    </AreaShell>
  );
}
