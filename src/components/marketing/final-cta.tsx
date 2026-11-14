import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="px-3 py-3 sm:px-5 sm:py-5">
      <div className="grain overflow-hidden rounded-[2rem] bg-blue-500 py-20 text-white md:rounded-[2.5rem] md:py-28">
        <PageContainer className="flex flex-col items-start gap-10 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <h2 id="cta-title" className="font-display text-display-xl font-extrabold">
              Your student price is waiting.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white md:text-xl">
              Get ready for the GCTU pilot. Install Perkly now and you&apos;ll be first in line when sign-up opens.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row md:flex-col lg:flex-row">
            <Button asChild size="lg" variant="accent">
              <Link href="/student">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline-inverse">
              <Link href="/install">Install the app</Link>
            </Button>
          </div>
        </PageContainer>
      </div>
    </section>
  );
}
