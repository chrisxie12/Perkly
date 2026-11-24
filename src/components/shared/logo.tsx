import { cn } from "@/lib/utils";

/**
 * The Perqly mark: a lowercase "p" on Perqly Purple, with an orange dot
 * for the perk. The same geometry is used for the PWA icons
 * (scripts/generate-icons.mjs), so keep the two in sync.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-9", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <rect width="48" height="48" rx="14" fill="#6D28D9" />
      <rect x="13" y="12" width="6.5" height="26" rx="3.25" fill="#FFFFFF" />
      <circle cx="24.5" cy="20.5" r="7" fill="none" stroke="#FFFFFF" strokeWidth="6.5" />
      <circle cx="35" cy="35.5" r="4.5" fill="#FF6B35" />
    </svg>
  );
}

export function Logo({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark
        className={cn(
          "size-9",
          inverse && "[&>circle:nth-child(3)]:stroke-blue-500 [&>rect:first-child]:fill-white [&>rect:nth-child(2)]:fill-blue-500",
        )}
      />
      <span
        className={cn("font-display text-[1.6rem] leading-none font-extrabold tracking-[-0.04em]", inverse ? "text-white" : "text-ink-900")}
      >
        perqly
      </span>
    </span>
  );
}
