import { Check, Printer, ScanLine, Scissors, Utensils } from "lucide-react";
import { InstallButton } from "@/components/marketing/install-button";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { PageContainer } from "@/components/layout/page-container";
import { CampusMap } from "@/components/marketing/campus-map";
import { LivePass } from "@/components/marketing/live-pass";
import { PhoneFrame } from "@/components/marketing/phone-frame";
import { QrArt } from "@/components/marketing/qr-art";

const promises = ["Free for students", "Works on any phone", "No app store needed"];

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-24 pb-10 md:pt-36 md:pb-24">
      {/* Backdrop: two slow colour glows and the campus map, all decorative */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -right-32 size-[38rem] animate-drift rounded-full bg-blue-300/35 blur-3xl" />
        <div className="absolute top-[45%] -left-40 size-[30rem] animate-drift rounded-full bg-orange-200/50 blur-3xl [animation-delay:-9s]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-paper" />
      </div>
      <PageContainer>
        <p className="inline-flex animate-rise items-center gap-2 rounded-full bg-white py-1.5 pr-4 pl-1.5 text-sm font-semibold text-ink-700 shadow-soft ring-1 ring-ink-200">
          <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-ink-900">Pilot</span>
          Launching first at GCTU, Accra
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
              <InstallButton />
            </div>

            <div id="notify" className="mt-8 animate-rise scroll-mt-28 [animation-delay:470ms]">
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
            <CampusMap className="pointer-events-none absolute top-1/2 left-1/2 -z-10 w-[40rem] max-w-none -translate-x-1/2 -translate-y-1/2 text-ink-900 sm:w-[46rem]" />
            <div className="relative z-10 animate-rise [animation-delay:260ms]">
              <PhoneFrame>
                <div className="px-4 pt-2 pb-6">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-sm font-bold text-ink-900">Your pass</p>
                    <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-ink-700">Example</span>
                  </div>
                  <LivePass className="mt-3 animate-stamp [animation-delay:900ms]" />
                  <div className="mt-4 flex items-center justify-center gap-2 rounded-full bg-ink-100 py-3 text-sm font-semibold text-ink-700">
                    <span className="size-2 animate-pulse rounded-full bg-orange-500" aria-hidden />
                    Waiting for the cashier to confirm
                  </div>
                </div>
              </PhoneFrame>
            </div>

            {/* Kinds of places, floating around the phone */}
            {[
              { icon: Utensils, label: "Food", pos: "-left-16 top-20 [--tilt:-6deg] lg:-left-32", delay: "[animation-delay:-1s]" },
              { icon: Printer, label: "Printing", pos: "-left-10 bottom-16 [--tilt:4deg] lg:-left-20", delay: "[animation-delay:-2.5s]" },
              { icon: Scissors, label: "Barbers", pos: "right-0 bottom-0 [--tilt:-3deg]", delay: "[animation-delay:-3.5s]" },
            ].map(({ icon: Icon, label, pos, delay }) => (
              <span
                key={label}
                aria-hidden
                className={`absolute z-20 hidden items-center gap-2 rounded-full bg-white/90 px-4 py-2.5 text-sm font-semibold text-ink-900 shadow-lift ring-1 ring-ink-200 backdrop-blur sm:flex ${pos}`}
              >
                <span className={`flex animate-bob items-center gap-2 ${delay}`}>
                  <Icon className="size-4 text-blue-500" />
                  {label}
                </span>
              </span>
            ))}

            <div
              aria-hidden
              className="absolute top-24 right-0 hidden w-48 rotate-[6deg] animate-rise rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink-200 [animation-delay:500ms] sm:block"
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
