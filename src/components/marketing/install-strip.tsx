import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { InstallButton } from "@/components/marketing/install-button";

/** The call to action after "How it works": install and use it now, or get an email when your campus opens. */
export function InstallStrip() {
  return (
    <section aria-labelledby="install-title" className="pb-4 sm:pb-16 md:pb-24">
      <PageContainer>
        <div className="reveal glass glass-card relative flex flex-col gap-6 overflow-hidden p-6 sm:p-10 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 id="install-title" className="font-display text-2xl font-extrabold text-ink-900 md:text-3xl">
              Put Perqly on your phone now.
            </h2>
            <p className="mt-2 text-lg leading-relaxed text-ink-600">
              It&apos;s free, needs no app store and uses very little data. GCTU students can sign up and start using it today. Not at GCTU?{" "}
              <Link href="#notify" className="font-semibold text-blue-700 underline underline-offset-2">
                Get an email when your campus opens
              </Link>
              .
            </p>
          </div>
          <InstallButton className="self-start md:self-auto" />
        </div>
      </PageContainer>
    </section>
  );
}
