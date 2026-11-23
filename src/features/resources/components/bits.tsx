import { BadgeCheck, Brain, Briefcase, Code2, GraduationCap, HelpCircle, Music, Palette, Percent, Rocket, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCheckedOn, offerLabel, OFFER_TYPES, resourceImageUrl, type Category, type Resource } from "../model";

const ICONS: Record<Category, typeof Brain> = {
  ai_productivity: Brain,
  developer_tools: Code2,
  learning_certifications: GraduationCap,
  career_internships: Briefcase,
  design_creativity: Palette,
  business_entrepreneurship: Rocket,
  finance_student_services: Wallet,
  entertainment_lifestyle: Music,
  discounts_trials: Percent,
};

const TONES: Record<Category, string> = {
  ai_productivity: "bg-violet-50 text-violet-700",
  developer_tools: "bg-blue-50 text-blue-700",
  learning_certifications: "bg-emerald-50 text-emerald-700",
  career_internships: "bg-orange-50 text-orange-700",
  design_creativity: "bg-pink-50 text-pink-700",
  business_entrepreneurship: "bg-amber-50 text-amber-800",
  finance_student_services: "bg-teal-50 text-teal-700",
  entertainment_lifestyle: "bg-rose-50 text-rose-700",
  discounts_trials: "bg-sky-50 text-sky-700",
};

/** A soft two-tone wash per category, for covers and headers without a photo. */
const WASHES: Record<Category, string> = {
  ai_productivity: "from-violet-500 to-fuchsia-400",
  developer_tools: "from-blue-600 to-sky-400",
  learning_certifications: "from-emerald-600 to-teal-400",
  career_internships: "from-orange-500 to-amber-400",
  design_creativity: "from-pink-500 to-rose-400",
  business_entrepreneurship: "from-amber-500 to-orange-400",
  finance_student_services: "from-teal-600 to-emerald-400",
  entertainment_lifestyle: "from-rose-500 to-pink-400",
  discounts_trials: "from-sky-500 to-blue-400",
};

/** The cover photo, or the category's colour wash with a large faint icon. */
export function ResourceCover({ resource, className }: { resource: Pick<Resource, "category" | "cover_path">; className?: string }) {
  const url = resourceImageUrl(resource.cover_path);
  const Icon = ICONS[resource.category];
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- public storage URL
      <img src={url} alt="" loading="lazy" className={cn("w-full object-cover", className)} />
    );
  }
  return (
    <span aria-hidden className={cn("relative block overflow-hidden bg-gradient-to-br", WASHES[resource.category], className)}>
      <Icon className="absolute -right-4 -bottom-6 size-32 text-white/25" strokeWidth={1.5} />
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgb(255_255_255/0.25),transparent_55%)]" />
    </span>
  );
}

/** The provider's logo on a white tile, or the category tile when there's no logo. */
export function ResourceLogo({
  resource,
  size = "md",
  className,
}: {
  resource: Pick<Resource, "category" | "logo_path" | "provider">;
  size?: "md" | "lg";
  className?: string;
}) {
  const url = resourceImageUrl(resource.logo_path);
  if (!url) return <CategoryTile category={resource.category} size={size} className={className} />;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200",
        size === "lg" ? "size-16 p-2" : "size-12 p-1.5",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
      <img src={url} alt={`${resource.provider} logo`} loading="lazy" className="size-full object-contain" />
    </span>
  );
}

/** The category's icon in a soft tile. */
export function CategoryTile({ category, size = "md", className }: { category: Category; size?: "md" | "lg"; className?: string }) {
  const Icon = ICONS[category];
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-2xl", TONES[category], size === "lg" ? "size-16" : "size-12", className)}
    >
      <Icon className={size === "lg" ? "size-8" : "size-6"} />
    </span>
  );
}

/** The clearly visible offer label: "Free for students", "$100 Azure credit", "Paid exam"… */
export function OfferPill({ resource, className }: { resource: Pick<Resource, "offer_type" | "offer_label">; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
        OFFER_TYPES[resource.offer_type].tone,
        className,
      )}
    >
      {offerLabel(resource)}
    </span>
  );
}

/** Whether eligibility has been checked, never hidden. */
export function EligibilityTag({ resource }: { resource: Pick<Resource, "eligibility" | "checked_on"> }) {
  if (resource.eligibility === "confirmed") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-emerald-700">
        <BadgeCheck className="size-4" aria-hidden /> Checked {formatCheckedOn(resource.checked_on)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-amber-800">
      <HelpCircle className="size-4" aria-hidden /> Needs verification
    </span>
  );
}
