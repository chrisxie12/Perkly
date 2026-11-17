import Link from "next/link";
import { Megaphone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { AreaShell } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import type { NavArea } from "@/lib/navigation/config";

/** What every Campus page shows while Campus is switched off. */
export function CampusClosed({ area = "student" }: { area?: NavArea }) {
  return (
    <AreaShell area={area}>
      <EmptyState
        icon={<Megaphone aria-hidden />}
        title="Campus isn't open yet"
        description="Your school's announcements and organisations will appear here."
      />
    </AreaShell>
  );
}

/** Shown when an organiser page is opened by someone who can't manage that organisation. */
export function NotManaging() {
  return (
    <AreaShell area="organise">
      <EmptyState
        title="You can't manage this organisation"
        description="You may have been removed, the organisation may be suspended, or your student verification may have ended."
        action={
          <Link href="/organise" className={buttonVariants({ variant: "secondary" })}>
            Your organisations
          </Link>
        }
      />
    </AreaShell>
  );
}
