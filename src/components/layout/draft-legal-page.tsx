import * as React from "react";
import { PageContainer } from "@/components/layout/page-container";

/** Legal pages are drafts until reviewed. They say so plainly. */
export function DraftLegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-32 pb-24 md:pt-40">
      <PageContainer className="max-w-3xl">
        <p className="inline-block rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-800">Draft, not yet in force</p>
        <h1 className="mt-5 font-display text-display-md font-extrabold">{title}</h1>
        <div className="mt-8 space-y-5 text-lg leading-relaxed text-ink-700">{children}</div>
      </PageContainer>
    </section>
  );
}
