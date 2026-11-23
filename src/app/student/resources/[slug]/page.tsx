import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Check, ChevronLeft, ExternalLink, Globe2, HelpCircle } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { AVAILABILITY, categoryLabel, formatCheckedOn, requirementLines } from "@/features/resources/model";
import { getResource } from "@/features/resources/queries";
import { OfferPill, ResourceCover, ResourceLogo } from "@/features/resources/components/bits";

export const metadata: Metadata = { title: "Student resource", robots: { index: false } };

export default async function ResourcePage({ params }: PageProps<"/student/resources/[slug]">) {
  const { slug } = await params;
  const r = await getResource(slug);
  if (!r) notFound();
  const checked = formatCheckedOn(r.checked_on);
  return (
    <AreaShell area="student">
      <Link
        href="/student/resources"
        className="mb-3 inline-flex h-10 items-center gap-1 rounded-full pr-3 text-[0.9375rem] font-semibold text-ink-700 hover:bg-ink-100"
      >
        <ChevronLeft className="size-5" aria-hidden /> Resources
      </Link>

      <div className="relative -mx-4 sm:mx-0">
        <ResourceCover resource={r} className="h-40 sm:h-52 sm:rounded-3xl" />
        <ResourceLogo resource={r} size="lg" className="absolute -bottom-8 left-4 shadow-lg ring-4 ring-white sm:left-6" />
      </div>
      <header className="mt-11">
        <p className="text-[0.8125rem] font-semibold text-ink-600">{categoryLabel(r.category)}</p>
        <h1 className="font-display text-2xl leading-tight font-extrabold tracking-tight">{r.name}</h1>
        <p className="text-[0.9375rem] text-ink-600">{r.provider}</p>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <OfferPill resource={r} className="px-3 py-1.5 text-sm" />
        <span className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-700">
          <Globe2 className="size-4" aria-hidden /> {AVAILABILITY[r.availability]}
        </span>
      </div>

      {r.eligibility === "confirmed" ? (
        <p className="mt-4 flex gap-2 rounded-2xl bg-emerald-50 p-3.5 text-sm text-emerald-900">
          <BadgeCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>Perqly checked these details against the provider&apos;s own information on {checked}. Offers can still change.</span>
        </p>
      ) : (
        <p className="mt-4 flex gap-2 rounded-2xl bg-amber-50 p-3.5 text-sm text-amber-900">
          <HelpCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            <strong>Needs verification.</strong> Perqly hasn&apos;t confirmed that this works for students in Ghana
            {checked ? ` (last looked at on ${checked})` : ""}. Check the provider&apos;s site before you rely on it.
          </span>
        </p>
      )}

      <p className="mt-5 text-lg leading-relaxed text-ink-900">{r.summary}</p>
      {r.description && <p className="mt-3 leading-relaxed text-ink-700">{r.description}</p>}

      {r.benefits.length > 0 && (
        <section aria-labelledby="benefits-h" className="mt-6">
          <h2 id="benefits-h" className="mb-2 font-display text-lg font-bold">
            What you get
          </h2>
          <ul className="space-y-2">
            {r.benefits.map((b) => (
              <li key={b} className="flex gap-2.5 text-[0.9375rem] text-ink-800">
                <Check className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden /> {b}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="needs-h" className="mt-6">
        <h2 id="needs-h" className="mb-2 font-display text-lg font-bold">
          What you need
        </h2>
        <ul className="space-y-1.5">
          {requirementLines(r).map((line) => (
            <li key={line} className="flex gap-2.5 text-[0.9375rem] text-ink-800">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-400" /> {line}
            </li>
          ))}
        </ul>
        {r.requirements_note && <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-700">{r.requirements_note}</p>}
      </section>

      <div className="sticky bottom-[calc(var(--frame-bottom,7rem)-1rem)] z-10 mt-8 bg-gradient-to-t from-paper from-70% pt-4 pb-2 md:bottom-0">
        <a
          href={r.official_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-on-lime flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 text-base font-bold shadow-lg transition-transform hover:brightness-105 active:scale-[0.98]"
        >
          Go to the official site <ExternalLink className="size-5" aria-hidden />
          <span className="sr-only">(opens {new URL(r.official_url).hostname} in a new tab)</span>
        </a>
      </div>

      <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-600">
        You&apos;ll leave Perqly for {new URL(r.official_url).hostname}. Perqly isn&apos;t affiliated with {r.provider}.
        {r.source_url && (
          <>
            {" "}
            <a
              href={r.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-700 underline underline-offset-2"
            >
              Where this information comes from
            </a>
            .
          </>
        )}
      </p>
    </AreaShell>
  );
}
