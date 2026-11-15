import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileCtaBar } from "@/components/layout/mobile-cta-bar";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-blue-500 px-5 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>
      <script
        // Keeps the browser's install offer if it arrives before the page's JavaScript; the Install button picks it up.
        dangerouslySetInnerHTML={{
          __html: "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__perqlyInstall=e})",
        }}
      />
      {/* The marketing pages keep their light design in dark mode (see globals.css). */}
      <div className="theme-fixed min-h-dvh bg-paper text-ink-900">
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
        <MobileCtaBar />
      </div>
    </>
  );
}
