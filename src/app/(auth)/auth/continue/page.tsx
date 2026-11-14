import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { LoadingIndicator } from "@/components/shared/states";
import { getUserContext } from "@/lib/auth/session";
import { AREA_HOME, AREA_LABEL, areaOfPath, safeNextPath } from "@/lib/auth/paths";
import { decideAccess, defaultDestination } from "@/lib/auth/roles";
import { AuthCard } from "@/features/auth/components/auth-card";

export const metadata: Metadata = { title: "Choose where to go", robots: { index: false } };

async function Continue({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect("/login");

  const { next: rawNext } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);
  if (next) {
    const area = areaOfPath(next);
    const decision = area ? decideAccess(area, ctx) : { kind: "allow" as const };
    if (decision.kind === "allow") redirect(next);
    if (decision.kind === "mfa") redirect(`/login/mfa?next=${encodeURIComponent(next)}`);
  }

  const destination = defaultDestination(ctx);
  if (destination.kind === "redirect") redirect(destination.path);

  return (
    <ul className="grid gap-3">
      {destination.areas.map((area) => (
        <li key={area}>
          <Link
            href={AREA_HOME[area]}
            className="flex items-center justify-between rounded-xl bg-white p-5 font-semibold text-ink-900 shadow-soft ring-1 ring-ink-200 transition-colors hover:bg-ink-100"
          >
            {AREA_LABEL[area]}
            <ArrowRight className="size-5 text-blue-500" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ContinuePage({ searchParams }: PageProps<"/auth/continue">) {
  return (
    <AuthCard title="Where would you like to go?" description="Your account has more than one role.">
      <Suspense fallback={<LoadingIndicator label="Signing you in" />}>
        <Continue searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
