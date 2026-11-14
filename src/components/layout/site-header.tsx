"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { marketingNav } from "@/config/site";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "pt-safe fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow] duration-300",
        scrolled ? "bg-paper/90 shadow-[0_1px_0_rgb(0_31_82/0.08)] backdrop-blur-md" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8 md:h-20 lg:px-10">
        <Link href="/" aria-label="Perqly home" className="rounded-lg">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {marketingNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-[0.9375rem] font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/register">Get started</Link>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <div className="flex h-16 items-center justify-between px-5">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
                <Logo inverse />
                <SheetClose asChild>
                  <Button variant="outline-inverse" size="icon" aria-label="Close menu">
                    <X className="size-6" />
                  </Button>
                </SheetClose>
              </div>
              <nav aria-label="Mobile" className="flex flex-1 flex-col gap-1 px-5 pt-8">
                {marketingNav.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <Link href={item.href} className="rounded-lg py-3 font-display text-4xl font-bold tracking-tight text-white">
                      {item.label}
                    </Link>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link href="/install" className="rounded-lg py-3 font-display text-4xl font-bold tracking-tight text-white">
                    Install the app
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link href="/login" className="rounded-lg py-3 font-display text-4xl font-bold tracking-tight text-white">
                    Sign in
                  </Link>
                </SheetClose>
              </nav>
              <div className="pb-safe grid gap-3 px-5 pt-6">
                <Button asChild variant="accent" size="lg">
                  <Link href="/register">Get started</Link>
                </Button>
                <Button asChild variant="outline-inverse" size="lg">
                  <Link href="/merchant">For merchants</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
