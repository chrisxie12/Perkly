import { BadgeCheck, Brain, Briefcase, Code2, GraduationCap, HelpCircle, Music, Palette, Percent, Rocket, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCheckedOn, offerLabel, OFFER_TYPES, type Category, type Resource } from "../model";

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

/** The category's icon in a soft tile. */
export function CategoryTile({ category, size = "md" }: { category: Category; size?: "md" | "lg" }) {
  const Icon = ICONS[category];
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-2xl", TONES[category], size === "lg" ? "size-16" : "size-12")}
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
