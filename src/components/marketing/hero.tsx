import { existsSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Printer, ScanLine, Scissors, Utensils } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { PageContainer } from "@/components/layout/page-container";
import { CampusMap } from "@/components/marketing/campus-map";
import { LivePass } from "@/components/marketing/live-pass";
import { PhoneFrame } from "@/components/marketing/phone-frame";
import { QrArt } from "@/components/marketing/qr-art";

const promises = ["Free for students", "Works on any phone", "No app store needed"];

/**
 * TODO(founder): drop a real screenshot of the live pass from the working app at
 * public/marketing/pass-screenshot.png (portrait, about 720×1480, from your own test account so
 * no real student's name or photo is shown). When the file is there the phone shows it; until
 * then it shows the labelled illustration.
 */
const PASS_SCREENSHOT = "/marketing/pass-screenshot.png";
const hasPassScreenshot = existsSync(join(process.cwd(), "public", PASS_SCREENSHOT));

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-24 pb-20 md:pt-36 md:pb-24">
      {/* Backdrop: two slow colour glows and the campus map, all decorative */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,#000_65%,transparent)]">
        <div className="absolute -top-40 -right-32 size-[38rem] animate-drift rounded-full bg-blue-400/40 blur-3xl" />
        <div className="absolute top-[45%] -left-40 size-[30rem] animate-drift rounded-full bg-orange-200/50 blur-3xl [animation-delay:-9s]" />
      </div>
      <PageContainer>
        <p className="glass inline-flex animate-rise items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold text-ink-700">
          <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-ink-900">Live</span>
          Live at GCTU, Accra. More campuses next.
        </p>

        <h1 id="hero-title" className="mt-7 font-display text-display-xl font-extrabold text-ink-900">
          <span className="block animate-rise [animation-delay:80ms] lg:whitespace-nowrap">Show your pass.</span>
          <span className="block animate-rise [animation-delay:200ms] lg:whitespace-nowrap">Pay the student price.</span>
        </h1>

        <div className="mt-6 grid grid-cols-1 items-start gap-10 sm:mt-10 sm:gap-14 lg:mt-12 lg:grid-cols-[1fr_auto] lg:gap-10">
          <div className="lg:max-w-xl lg:pt-6">
            <p className="animate-rise text-lg leading-relaxed text-ink-700 [animation-delay:320ms] md:text-xl">
              Perqly gets verified students real discounts at food spots, print shops and services around campus. Perqly confirms
              you&apos;re a student. Merchants pay for the deals. You just show up.
            </p>

            <div className="mt-9 animate-rise [animation-delay:420ms]">
              <Link
                href="/student"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "press bg-blue-600 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_14px_30px_-12px_rgb(0_102_255/0.8)] hover:bg-blue-700",
                )}
              >
                Open Perqly <ArrowRight className="size-5" aria-hidden />
              </Link>
            </div>

            <div id="notify" className="mt-10 animate-rise scroll-mt-28 [animation-delay:470ms]">
              <WaitlistForm source="hero" />
            </div>

            <ul className="mt-8 flex animate-rise flex-wrap gap-x-6 gap-y-2 text-[0.9375rem] font-medium text-ink-700 [animation-delay:520ms]">
              {promises.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-full bg-blue-500 text-white">
                    <Check className="size-3.5" strokeWidth={3} aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* The product at the counter: the merchant's printed QR beside the student's phone */}
          <div className="relative mx-auto flex w-full max-w-[34rem] items-start justify-center sm:justify-start lg:mx-0 lg:w-[34rem]">
            {/* The neighbourhood behind the phone: campus, routes, shops */}
            <CampusMap className="pointer-events-none absolute top-1/2 left-1/2 -z-10 w-[40rem] max-w-none -translate-x-1/2 -translate-y-1/2 [mask-image:radial-gradient(closest-side,#000_35%,transparent_80%)] text-ink-900 sm:w-[46rem]" />
            <div className="relative z-10 animate-rise [animation-delay:260ms] [perspective:1200px]">
              <div className="hero-tilt">
                <PhoneFrame>
                  {hasPassScreenshot ? (
                    <Image
                      src={PASS_SCREENSHOT}
                      alt="The live pass in the Perqly app, waiting for the cashier to confirm"
                      width={720}
                      height={1480}
                      priority
                      className="h-auto w-full"
                    />
                  ) : (
                    <div className="px-4 pt-2 pb-6">
                      <div className="flex items-center justify-between">
                        <p className="font-display text-sm font-bold text-ink-900">Your pass</p>
                        <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-ink-700">Example</span>
                      </div>
                      <LivePass className="mt-3 animate-stamp [animation-delay:900ms]" />
                      <p className="mt-4 rounded-full bg-ink-100 py-3 text-center text-sm font-semibold text-ink-700">
                        Waiting for the cashier to confirm
                      </p>
                    </div>
                  )}
                </PhoneFrame>
              </div>
            </div>

            {/* Glossy cedi coins drifting beside the phone */}
            <span
              aria-hidden
              className="coin-spin gloss-orange absolute -top-10 left-0 z-20 hidden size-14 place-items-center rounded-full font-display text-2xl font-black text-ink-900 sm:grid lg:-left-16"
            >
              ₵
            </span>
            <span
              aria-hidden
              className="coin-spin gloss-blue absolute right-6 bottom-24 z-20 hidden size-11 place-items-center rounded-full font-display text-lg font-black text-white [animation-delay:-2s] sm:grid"
            >
              ₵
            </span>

            {/* Kinds of places, floating around the phone */}
            {[
              { icon: Utensils, label: "Food", pos: "-left-16 top-20 [--tilt:-6deg] lg:-left-32", delay: "[animation-delay:-1s]" },
              { icon: Printer, label: "Printing", pos: "-left-10 bottom-16 [--tilt:4deg] lg:-left-20", delay: "[animation-delay:-2.5s]" },
              { icon: Scissors, label: "Barbers", pos: "right-0 bottom-0 [--tilt:-3deg]", delay: "[animation-delay:-3.5s]" },
            ].map(({ icon: Icon, label, pos, delay }) => (
              <span
                key={label}
                aria-hidden
                className={`glass absolute z-20 hidden items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-ink-900 sm:flex ${pos}`}
              >
                <span className={`flex animate-bob items-center gap-2 ${delay}`}>
                  <Icon className="size-4 text-blue-500" />
                  {label}
                </span>
              </span>
            ))}

            <div
              aria-hidden
              className="glass absolute top-24 right-0 hidden w-52 rotate-[6deg] animate-rise rounded-3xl p-4 [animation-delay:500ms] sm:block md:p-6"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-ink-900">
                <ScanLine className="size-4 text-blue-500" /> Scan with Perqly
              </div>
              <QrArt className="mt-3 w-full text-ink-900" seed={11} />
              <p className="mt-3 text-[0.6875rem] leading-snug font-semibold text-ink-600">Example shop QR, not a real business</p>
            </div>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
