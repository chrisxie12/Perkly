import Link from "next/link";
import { Check, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { LivePass } from "@/components/marketing/live-pass";
import { PhoneFrame } from "@/components/marketing/phone-frame";
import { QrArt } from "@/components/marketing/qr-art";

const promises = ["Free for students", "Works on any phone", "No app store needed"];

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24">
      <PageContainer>
        <p className="inline-flex animate-rise items-center gap-2 rounded-full bg-white py-1.5 pr-4 pl-1.5 text-sm font-semibold text-ink-700 shadow-soft ring-1 ring-ink-200">
          <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-ink-900">Pilot</span>
          Launching first at GCTU, Accra
        </p>

        <h1 id="hero-title" className="mt-7 font-display text-display-xl font-extrabold text-ink-900">
          <span className="block animate-rise [animation-delay:80ms] lg:whitespace-nowrap">Show your pass.</span>
          <span className="block animate-rise [animation-delay:200ms] lg:whitespace-nowrap">Pay the student price.</span>
        </h1>

        <div className="mt-10 grid grid-cols-1 items-start gap-14 lg:mt-12 lg:grid-cols-[1fr_auto] lg:gap-10">
          <div className="lg:max-w-xl lg:pt-6">
            <p className="animate-rise text-lg leading-relaxed text-ink-700 [animation-delay:320ms] md:text-xl">
              Perqly gets verified students real discounts at food spots, print shops and services around campus. Your school confirms
              you&apos;re a student. Merchants pay for the deals. You just show up.
            </p>

            <div className="mt-9 flex animate-rise flex-col gap-3 [animation-delay:420ms] sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">Get started</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/#merchants">I run a business</Link>
              </Button>
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
