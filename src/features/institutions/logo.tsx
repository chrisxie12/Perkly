"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * An institution's official logo on a white tile, never cropped or recoloured
 * (object-contain keeps the crest's own proportions; the white tile keeps it
 * legible on dark backgrounds). Without a logo, or if it fails to load, the
 * short name is shown instead.
 */
export function InstitutionLogo({
  src,
  name,
  shortName,
  size = "md",
  className,
}: {
  src: string | null;
  name: string;
  shortName: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box = { sm: "size-10 rounded-xl p-1", md: "size-12 rounded-2xl p-1.5", lg: "size-16 rounded-2xl p-2" }[size];
  const text = { sm: "text-[0.625rem]", md: "text-xs", lg: "text-sm" }[size];
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-white ring-1 ring-ink-200", box, className)}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- public storage URL; SVG logos
        <img src={src} alt={`${name} logo`} className="size-full object-contain" onError={() => setFailed(true)} loading="lazy" />
      ) : (
        <span aria-hidden className={cn("px-0.5 text-center leading-tight font-extrabold tracking-tight break-all text-blue-700", text)}>
          {shortName.slice(0, 7)}
        </span>
      )}
    </span>
  );
}
