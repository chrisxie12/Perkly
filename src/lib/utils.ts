import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know our custom font sizes (text-display-*),
 * otherwise it mistakes them for text colours and drops them when a
 * colour class like text-ink-900 follows.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display-xl", "display-lg", "display-md"] }],
    },
  },
});

/** Merge Tailwind class names, letting later classes win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
