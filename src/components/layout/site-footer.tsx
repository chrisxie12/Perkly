import Link from "next/link";
import { cacheLife } from "next/cache";
import { Logo } from "@/components/shared/logo";
import { PageContainer } from "@/components/layout/page-container";

const columns = [
  {
    title: "Perqly",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#students", label: "For students" },
      { href: "/#faq", label: "FAQ" },
      { href: "/install", label: "Install the app" },
    ],
  },
  {
    title: "Partners",
    links: [
      { href: "/merchants", label: "For businesses" },
      { href: "/register?as=merchant", label: "Merchant sign-up" },
      { href: "/institution", label: "For institutions" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

/** Cached so pages stay static; refreshed daily, so it flips on 1 January. */
async function getCurrentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export async function SiteFooter() {
  const year = await getCurrentYear();
  return (
    <footer className="bg-ink-900 pb-28 text-ink-300 md:pb-12">
      <PageContainer className="grid grid-cols-2 gap-x-6 gap-y-10 pt-12 sm:gap-12 sm:pt-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="col-span-2 md:col-span-1">
          <Logo inverse />
          <p className="mt-5 max-w-xs leading-relaxed">
            Student benefits. Real campus value. Built in Ghana for Ghanaian tertiary students.
          </p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="font-display text-base font-bold text-white">{column.title}</h2>
            <ul className="mt-4 space-y-3">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="rounded transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </PageContainer>
      <PageContainer className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-8 text-sm sm:mt-14 sm:flex-row sm:justify-between">
        <p>© {year} Perqly. All rights reserved.</p>
        <p>Made in Accra, Ghana</p>
      </PageContainer>
    </footer>
  );
}
