"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { marketingNav } from "@/config/site";

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-5 md:pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="glass mx-auto flex h-14 w-full max-w-6xl items-center justify-between rounded-full pr-2 pl-4 sm:pl-5 md:h-16">
        <Link href="/" aria-label="Perqly home" className="rounded-lg">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {marketingNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="press rounded-full px-4 py-2 text-[0.9375rem] font-medium text-ink-700 transition-colors hover:bg-white/80 hover:text-ink-900"
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
                  <Link href="/merchants">For businesses</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
