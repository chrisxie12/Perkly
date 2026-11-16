"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";

export type MapPoint = {
  branchId: string;
  latitude: number;
  longitude: number;
  merchantName: string;
  saving: string;
  dealCount: number;
  href: string;
  away: string | null;
  open: boolean | null;
};

export type MapCampus = { name: string; latitude: number; longitude: number } | null;

const ACCRA = { latitude: 5.6037, longitude: -0.187 };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Shops with live deals on an OpenStreetMap map, around the student's campus. */
export function DealMap({ points, campus }: { points: MapPoint[]; campus: MapCampus }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      const centre = campus ?? points[0] ?? ACCRA;
      map = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([centre.latitude, centre.longitude], 15);
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      L.control.zoom({ position: "topright" }).addTo(map);

      if (campus) {
        L.marker([campus.latitude, campus.longitude], {
          keyboard: false,
          icon: L.divIcon({
            className: "",
            iconSize: [20, 20],
            html: '<span class="block size-5 rounded-full border-4 border-white bg-[#0066FF] shadow-lg"></span>',
          }),
          title: `${campus.name} campus`,
        })
          .addTo(map)
          .bindTooltip(`${campus.name} campus`, { direction: "top", offset: [0, -10] });
      }

      const bounds = L.latLngBounds([]);
      if (campus) bounds.extend([campus.latitude, campus.longitude]);
      for (const p of points) {
        const pin = document.createElement("span");
        pin.className =
          "grid size-11 place-items-center rounded-full border-4 border-white text-xs font-black text-white shadow-xl " +
          (p.open === false ? "bg-[#64748b]" : "bg-[#FF6B35]");
        pin.textContent = initials(p.merchantName);

        const card = document.createElement("a");
        card.href = p.href;
        card.className = "block min-w-44 no-underline";
        const name = document.createElement("strong");
        name.className = "block font-display text-sm text-[#0b1220]";
        name.textContent = p.merchantName;
        const saving = document.createElement("span");
        saving.className = "block font-display text-lg font-black uppercase leading-tight text-[#0066FF]";
        saving.textContent = p.saving + (p.dealCount > 1 ? ` · ${p.dealCount} deals` : "");
        const meta = document.createElement("span");
        meta.className = "mt-1 block text-[11px] font-bold tracking-wider text-[#64748b] uppercase";
        meta.textContent = [p.away, p.open === false ? "Closed now" : null].filter(Boolean).join(" · ") || "See deal";
        card.append(name, saving, meta);

        L.marker([p.latitude, p.longitude], {
          title: `${p.merchantName}, ${p.saving}`,
          icon: L.divIcon({ className: "", iconSize: [44, 44], iconAnchor: [22, 22], html: pin }),
        })
          .addTo(map)
          .bindPopup(card, { closeButton: false, offset: [0, -16] });
        bounds.extend([p.latitude, p.longitude]);
      }
      if (points.length > 0 && bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [points, campus]);

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
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 16);
      },
      () => {
        setLocating(false);
        setLocateError("Couldn't get your location. Check that location is allowed for Perqly.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="theme-fixed relative isolate">
      <div
        ref={box}
        role="region"
        aria-label="Map of shops with student deals"
        className="h-[calc(100dvh-23rem)] min-h-72 w-full overflow-hidden rounded-[28px] bg-[#f4f1ea] ring-1 ring-ink-200 md:h-[calc(100dvh-16rem)]"
      />
      <button
        type="button"
        onClick={locate}
        className="absolute bottom-4 left-4 z-[1000] flex h-11 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-ink-900 shadow-lg active:scale-95"
      >
        <LocateFixed className="size-4 text-blue-500" aria-hidden /> {locating ? "Finding you…" : "Where am I?"}
      </button>
      {locateError && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {locateError}
        </p>
      )}
    </div>
  );
}
