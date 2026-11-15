import { useId } from "react";

/**
 * Hero backdrop: an illustrated map around campus. A route draws itself from
 * the campus pin to nearby shop pins, the idea behind Perqly in one picture.
 * Pure SVG and CSS, no images to download; decorative only.
 */
export function CampusMap({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const shops = [
    { x: 432, y: 168, d: "0s" },
    { x: 496, y: 352, d: "0.9s" },
    { x: 300, y: 452, d: "1.8s" },
  ];
  return (
    <svg viewBox="0 0 600 600" className={className} aria-hidden fill="none">
      <defs>
        <pattern id={`${id}-dots`} width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" opacity="0.18" />
        </pattern>
        <radialGradient id={`${id}-fade`} cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#fff" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-mask`}>
          <rect width="600" height="600" fill={`url(#${id}-fade)`} />
        </mask>
      </defs>
      <g mask={`url(#${id}-mask)`}>
        <rect width="600" height="600" fill={`url(#${id}-dots)`} />
        {/* Streets */}
        <g stroke="currentColor" strokeLinecap="round" opacity="0.14">
          <path d="M-20 250 C 120 230, 260 300, 620 210" strokeWidth="18" />
          <path d="M210 -20 C 230 160, 180 360, 260 620" strokeWidth="14" />
          <path d="M380 -20 C 360 200, 470 380, 430 620" strokeWidth="10" />
          <path d="M-20 470 C 160 430, 380 520, 620 440" strokeWidth="10" />
        </g>
        {/* Blocks */}
        <g fill="currentColor" opacity="0.06">
          <rect x="250" y="40" width="96" height="70" rx="14" />
          <rect x="460" y="40" width="110" height="90" rx="14" />
          <rect x="40" y="300" width="130" height="110" rx="14" />
          <rect x="300" y="300" width="100" height="90" rx="14" />
          <rect x="470" y="470" width="110" height="100" rx="14" />
        </g>
      </g>
      {/* Routes from campus to each shop */}
      <g strokeLinecap="round" strokeWidth="4" strokeDasharray="10 12" className="text-blue-500" stroke="currentColor">
        <path d="M150 170 C 250 120, 340 200, 432 168" className="animate-draw [--len:520]" />
        <path d="M150 170 C 230 260, 380 260, 496 352" className="animate-draw [--len:620] [animation-delay:0.9s]" />
        <path d="M150 170 C 120 300, 220 420, 300 452" className="animate-draw [--len:560] [animation-delay:1.8s]" />
      </g>
      {/* Campus */}
      <g transform="translate(150 170)">
        <circle r="34" className="origin-center animate-ring fill-blue-500/15 [transform-box:fill-box]" />
        <circle r="22" className="fill-blue-500" />
        <path d="M-10 2 L0 -8 L10 2 M-6 0 V8 H6 V0" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </g>
      {/* Shops */}
      {shops.map((s) => (
        <g key={s.x} transform={`translate(${s.x} ${s.y})`}>
          <circle
            r="26"
            className="origin-center animate-ring fill-orange-500/20 [transform-box:fill-box]"
            style={{ animationDelay: s.d }}
          />
          <circle r="15" className="fill-orange-500" />
          <circle r="5" fill="#fff" />
        </g>
      ))}
    </svg>
  );
}
