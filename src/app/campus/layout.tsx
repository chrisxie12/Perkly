import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { PageContainer } from "@/components/layout/page-container";
import { LoadingIndicator } from "@/components/shared/states";

/** Public Campus pages: reachable by link only, never indexed (decision record, detail 5). */
export default function PublicCampusLayout({ children }: LayoutProps<"/campus">) {
  return (
    <div className="min-h-dvh bg-paper text-ink-900">
      <header className="border-b border-ink-200 bg-white">
        <PageContainer className="flex h-16 items-center justify-between">
          <Link href="/" aria-label="Perqly home">
            <Logo />
          </Link>
          <Link href="/login" className="font-semibold text-blue-600">
            Sign in
          </Link>
        </PageContainer>
      </header>
      <main id="main">
        <PageContainer className="max-w-2xl py-8">
          <Suspense fallback={<LoadingIndicator />}>{children}</Suspense>
        </PageContainer>
      </main>
    </div>
  );
}
