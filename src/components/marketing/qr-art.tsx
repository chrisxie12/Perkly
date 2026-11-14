import { cn } from "@/lib/utils";

/**
 * Decorative QR-style artwork for illustrations. Deterministic, so server
 * and client render the same thing. It is deliberately not a scannable code.
 */
export function QrArt({ className, seed = 7 }: { className?: string; seed?: number }) {
  const size = 21;
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };

  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > size - 9 && y < 8) || (x < 8 && y > size - 9);

  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inFinder(x, y) && next() > 0.52) cells.push({ x, y });
    }
  }

  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" rx="1.6" fill="currentColor" />
      <rect x={x + 1} y={y + 1} width="5" height="5" rx="1.1" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" rx="0.8" fill="currentColor" />
    </g>
  );

  return (
    <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} className={cn("text-ink-900", className)} aria-hidden>
      <rect x="-1" y="-1" width={size + 2} height={size + 2} rx="2" fill="#fff" />
      {cells.map((c) => (
        <rect key={`${c.x}:${c.y}`} x={c.x + 0.08} y={c.y + 0.08} width="0.84" height="0.84" rx="0.25" fill="currentColor" />
      ))}
      {finder(0, 0)}
      {finder(size - 7, 0)}
      {finder(0, size - 7)}
    </svg>
  );
}
