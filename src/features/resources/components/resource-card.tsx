import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Resource } from "../model";
import { CategoryTile, EligibilityTag, OfferPill } from "./bits";

/** One resource in a list: icon, name and provider, the offer label, a one-line summary, eligibility. */
export function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <Link
      href={`/student/resources/${resource.slug}`}
      className="flex gap-3 rounded-[22px] bg-white p-3.5 ring-1 ring-ink-200/70 transition-shadow hover:shadow-[0_16px_32px_-16px_rgba(0,0,0,0.15)]"
    >
      <CategoryTile category={resource.category} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block leading-snug font-bold text-ink-900">{resource.name}</span>
            <span className="block truncate text-[0.8125rem] text-ink-600">{resource.provider}</span>
          </span>
          <ChevronRight className="mt-0.5 size-5 shrink-0 text-ink-400" aria-hidden />
        </span>
        <span className="mt-1.5 line-clamp-2 text-sm text-ink-700">{resource.summary}</span>
        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <OfferPill resource={resource} />
          <EligibilityTag resource={resource} />
        </span>
      </span>
    </Link>
  );
}

/** A compact card for the sideways "Featured" row. */
export function FeaturedResourceCard({ resource }: { resource: Resource }) {
  return (
    <Link
      href={`/student/resources/${resource.slug}`}
      className="flex h-full w-64 shrink-0 snap-start flex-col rounded-[22px] bg-white p-4 ring-1 ring-ink-200/70"
    >
      <span className="flex items-center justify-between gap-2">
        <CategoryTile category={resource.category} />
        <OfferPill resource={resource} />
      </span>
      <span className="mt-3 leading-snug font-bold text-ink-900">{resource.name}</span>
      <span className="text-[0.8125rem] text-ink-600">{resource.provider}</span>
      <span className="mt-1.5 line-clamp-2 text-sm text-ink-700">{resource.summary}</span>
      <span className="mt-auto pt-2">
        <EligibilityTag resource={resource} />
      </span>
    </Link>
  );
}
