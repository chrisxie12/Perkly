"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sticky "Get Perkly" bar on phones. It appears after the hero and hides
 * again when the footer comes into view, so it never covers footer links.
 */
export function MobileCtaBar() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const footer = document.querySelector("footer");
    let pastHero = false;
    let footerInView = false;
    const update = () => setVisible(pastHero && !footerInView);

    const onScroll = () => {
      pastHero = window.scrollY > window.innerHeight * 0.7;
      update();
    };
    const observer = new IntersectionObserver(([entry]) => {
      footerInView = entry.isIntersecting;
      update();
    });
    if (footer) observer.observe(footer);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      inert={!visible}
      className={cn(
        "pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 px-4 pt-3 backdrop-blur-md transition-transform duration-300 md:hidden",
        visible ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm leading-snug text-ink-700">
          <span className="font-semibold text-ink-900">Free for students.</span> Launching at GCTU.
        </p>
        <Button asChild>
          <Link href="/student">Get Perkly</Link>
        </Button>
      </div>
    </div>
  );
}
