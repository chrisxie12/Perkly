import { BadgeCheck, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { badgeLabel, type Badge as BadgeKind } from "../schemas";

/** The two Campus badges (D-C1). Nothing at all for an organisation Perqly hasn't verified. */
export function OrganisationBadge({ badge, className }: { badge: BadgeKind | undefined; className?: string }) {
  const label = badgeLabel(badge);
  if (!label) return null;
  return (
    <Badge variant={badge === "university_official" ? "blue" : "success"} className={className}>
      {badge === "university_official" ? <Landmark aria-hidden /> : <BadgeCheck aria-hidden />}
      {label}
    </Badge>
  );
}
