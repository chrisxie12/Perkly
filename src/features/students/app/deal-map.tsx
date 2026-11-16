"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Footprints, LocateFixed, School, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/features/offers/components/marketplace";

export type MapPoint = {
  branchId: string;
  latitude: number;
  longitude: number;
  merchantName: string;
  saving: string;
  dealCount: number;
  dealTitle: string;
  href: string;
  away: string | null;
  open: boolean | null;
  openText: string | null;
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
  photo: string | null;
  rating: number | null;
};

export type MapCampus = { name: string; latitude: number; longitude: number } | null;

const ACCRA = { latitude: 5.6037, longitude: -0.187 };

/** Shops with live deals on an OpenStreetMap map, with a swipeable row of cards. */
export function DealMap({ points, campus }: { points: MapPoint[]; campus: MapCampus }) {
  const box = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLUListElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markers = useRef(new Map<string, import("leaflet").Marker>());
  const fitted = useRef<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const categories = useMemo(() => {
    const seen = new Map<string, { slug: string; name: string; icon: string }>();
    for (const p of points) seen.set(p.categorySlug, { slug: p.categorySlug, name: p.categoryName, icon: p.categoryIcon });
    return [...seen.values()];
  }, [points]);
  const shown = useMemo(() => (category ? points.filter((p) => p.categorySlug === category) : points), [points, category]);

  // Build the map once.
  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    const pins = markers.current;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      const centre = campus ?? points[0] ?? ACCRA;
      map = L.map(box.current, { zoomControl: false }).setView([centre.latitude, centre.longitude], 15);
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      if (campus) {
        L.marker([campus.latitude, campus.longitude], {
          keyboard: false,
          interactive: false,
          icon: L.divIcon({
            className: "",
            iconSize: [22, 22],
            html: '<span class="block size-[22px] rounded-full border-4 border-white bg-[#0066FF] shadow-[0_0_0_8px_rgba(0,102,255,0.18)]"></span>',
          }),
        }).addTo(map);
      }
      map.on("click", () => setSelected(null));
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      pins.clear();
      fitted.current = null;
    };
  }, [campus, points]);

  // Pins for the shops shown; refit when the filter changes.
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      for (const m of markers.current.values()) m.remove();
      markers.current.clear();
      const bounds = L.latLngBounds([]);
      if (campus) bounds.extend([campus.latitude, campus.longitude]);
      for (const p of shown) {
        const pin = document.createElement("span");
        pin.className = cn(
          "flex items-center gap-1 rounded-full border-[3px] border-white px-2.5 py-1 text-xs font-black whitespace-nowrap text-white uppercase shadow-lg transition-transform",
          p.open === false ? "bg-[#64748b]" : "bg-[#FF6B35]",
          selected === p.branchId && "scale-125 bg-[#0066FF]",
        );
        pin.textContent = p.saving;
        const marker = L.marker([p.latitude, p.longitude], {
          title: `${p.merchantName}, ${p.saving}`,
          zIndexOffset: selected === p.branchId ? 1000 : 0,
          icon: L.divIcon({ className: "", iconSize: undefined, iconAnchor: [30, 14], html: pin }),
        }).addTo(map);
        marker.on("click", () => {
          setSelected(p.branchId);
          strip.current
            ?.querySelector(`[data-branch="${p.branchId}"]`)
            ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        });
        markers.current.set(p.branchId, marker);
        bounds.extend([p.latitude, p.longitude]);
      }
      if (!selected && shown.length > 0 && bounds.isValid())
        map.fitBounds(bounds, { paddingTopLeft: [40, 80], paddingBottomRight: [40, 190], maxZoom: 16 });
    });
    return () => {
      cancelled = true;
    };
  }, [shown, campus, selected, category]);

  function focus(p: MapPoint) {
    setSelected(p.branchId);
    mapRef.current?.flyTo([p.latitude, p.longitude], Math.max(mapRef.current.getZoom(), 16), { duration: 0.6 });
  }

  function locate() {
    if (!navigator.geolocation) {
      setLocateError("This phone can't share its location.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        mapRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 0.6 });
      },
      () => {
        setLocating(false);
        setLocateError("Couldn't get your location. Allow location for Perqly in your phone's settings.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const control =
    "flex h-10 items-center gap-1.5 rounded-2xl bg-white px-3 text-sm font-bold text-ink-900 shadow-lg ring-1 ring-black/5 active:scale-95";

  return (
    <div className="theme-fixed relative isolate h-[calc(100dvh-14.5rem)] min-h-[26rem] overflow-hidden rounded-[28px] bg-[#e8eef3] ring-1 ring-ink-200 md:h-[calc(100dvh-11rem)]">
      <div ref={box} role="region" aria-label="Map of shops with student deals" className="absolute inset-0" />

      {/* Filters */}
      {categories.length > 1 && (
        <div className="absolute inset-x-0 top-0 z-[1000] flex [scrollbar-width:none] gap-2 overflow-x-auto p-3">
          {[{ slug: null, name: "All", icon: "" }, ...categories].map((c) => (
            <button
              key={c.slug ?? "all"}
              type="button"
              aria-pressed={category === c.slug}
              onClick={() => {
                setCategory(c.slug);
                setSelected(null);
              }}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold shadow-md",
                category === c.slug ? "bg-[#0066FF] text-white" : "bg-white text-ink-900",
              )}
            >
              {c.icon && <CategoryIcon name={c.icon} className="size-3.5" />}
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Map controls */}
      <div className="absolute top-16 right-3 z-[1000] flex flex-col items-end gap-2">
        {campus && (
          <button
            type="button"
            className={control}
            onClick={() => mapRef.current?.flyTo([campus.latitude, campus.longitude], 16, { duration: 0.6 })}
          >
            <School className="size-4 text-blue-500" aria-hidden /> Campus
          </button>
        )}
        <button type="button" className={control} onClick={locate}>
          <LocateFixed className="size-4 text-blue-500" aria-hidden /> {locating ? "Finding…" : "Me"}
          <span className="sr-only">: show where I am</span>
        </button>
        <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5">
          <button
            type="button"
            aria-label="Zoom in"
            className="grid size-10 place-items-center text-lg font-bold text-ink-900"
            onClick={() => mapRef.current?.zoomIn()}
          >
            +
          </button>
          <span className="h-px bg-ink-200" aria-hidden />
          <button
            type="button"
            aria-label="Zoom out"
            className="grid size-10 place-items-center text-lg font-bold text-ink-900"
            onClick={() => mapRef.current?.zoomOut()}
          >
            −
          </button>
        </div>
      </div>
      {locateError && (
        <p
          role="alert"
          className="absolute inset-x-3 top-16 z-[1001] mr-28 rounded-2xl bg-white p-3 text-sm font-medium text-red-700 shadow-lg"
        >
          {locateError}
        </p>
      )}

      {/* Places */}
      {shown.length > 0 ? (
        <ul
          ref={strip}
          aria-label="Places on the map"
          className="absolute inset-x-0 bottom-0 z-[1000] flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto px-3 pt-2 pb-6"
        >
          {shown.map((p) => (
            <li key={p.branchId} data-branch={p.branchId} className="w-[78%] max-w-80 shrink-0 snap-center">
              <div
                className={cn(
                  "flex gap-3 rounded-3xl bg-white p-2.5 shadow-xl ring-1 transition-shadow",
                  selected === p.branchId ? "ring-2 ring-[#0066FF]" : "ring-black/5",
                )}
              >
                <button
                  type="button"
                  onClick={() => focus(p)}
                  aria-label={`Show ${p.merchantName} on the map`}
                  className="size-20 shrink-0 overflow-hidden rounded-2xl bg-ink-100"
                >
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- public storage URL
                    <img src={p.photo} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center bg-orange-50 text-orange-600">
                      <CategoryIcon name={p.categoryIcon} className="size-8" />
                    </span>
                  )}
                </button>
                <Link href={p.href} className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 font-display leading-tight font-extrabold text-ink-900">{p.merchantName}</span>
                    <span className="shrink-0 font-display text-sm font-black text-[#0066FF] uppercase">{p.saving}</span>
                  </span>
                  <span className="truncate text-[0.8125rem] text-ink-600">
                    {p.dealTitle}
                    {p.dealCount > 1 ? ` +${p.dealCount - 1} more` : ""}
                  </span>
                  <span className="mt-auto flex flex-wrap items-center gap-x-2.5 text-xs text-ink-600">
                    {p.rating && (
                      <span className="inline-flex items-center gap-0.5 font-semibold text-ink-900">
                        <Star className="size-3 fill-orange-500 text-orange-500" aria-hidden /> {p.rating.toFixed(1)}
                      </span>
                    )}
                    {p.away && (
                      <span className="inline-flex items-center gap-1">
                        <Footprints className="size-3" aria-hidden /> {p.away}
                      </span>
                    )}
                    {p.openText && <span className={p.open ? "font-semibold text-emerald-700" : ""}>{p.openText}</span>}
                    <ChevronRight className="ml-auto size-4 text-ink-600" aria-hidden />
                  </span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="absolute inset-x-3 bottom-6 z-[1000] rounded-2xl bg-white p-4 text-center text-sm font-medium text-ink-700 shadow-lg">
          No shops with deals have pinned their location yet.
        </p>
      )}
    </div>
  );
}
