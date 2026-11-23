import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Resource } from "../model";
import { EligibilityTag, OfferPill, ResourceCover, ResourceLogo } from "./bits";

/** One resource in a list: icon, name and provider, the offer label, a one-line summary, eligibility. */
export function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <Link
      href={`/student/resources/${resource.slug}`}
      className="flex gap-3 rounded-[22px] bg-white p-3.5 ring-1 ring-ink-200/70 transition-shadow hover:shadow-[0_16px_32px_-16px_rgba(0,0,0,0.15)]"
    >
      <ResourceLogo resource={resource} />
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

/** A card for the sideways "Featured" row: cover photo (or colour wash) with the logo on top. */
export function FeaturedResourceCard({ resource }: { resource: Resource }) {
  return (
    <Link
      href={`/student/resources/${resource.slug}`}
      className="flex h-full w-64 shrink-0 snap-start flex-col overflow-hidden rounded-[22px] bg-white ring-1 ring-ink-200/70"
    >
      <span className="relative block">
        <ResourceCover resource={resource} className="h-28" />
        <OfferPill resource={resource} className="absolute top-3 right-3 shadow-sm ring-1 ring-black/5" />
        <ResourceLogo resource={resource} className="absolute -bottom-6 left-4 shadow-md ring-4 ring-white" />
      </span>
      <span className="flex flex-1 flex-col px-4 pt-8 pb-4">
        <span className="leading-snug font-bold text-ink-900">{resource.name}</span>
        <span className="text-[0.8125rem] text-ink-600">{resource.provider}</span>
        <span className="mt-1.5 line-clamp-2 text-sm text-ink-700">{resource.summary}</span>
        <span className="mt-auto pt-2">
          <EligibilityTag resource={resource} />
        </span>
      </span>
    </Link>
  );
}
