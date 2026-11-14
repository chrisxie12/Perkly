import Link from "next/link";
import { BarChart3, Check, Printer, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { QrArt } from "@/components/marketing/qr-art";

const benefits = [
  { icon: Users, title: "Reach verified students", body: "Every Perqly customer has been approved by their school." },
  { icon: Printer, title: "No scanner needed", body: "Print your branch QR and put it on the counter. That's the setup." },
  { icon: Smartphone, title: "Confirm from any phone", body: "Passes show up on your counter screen. Tap to confirm." },
  { icon: BarChart3, title: "See what's working", body: "Views, redemptions and repeat students for every offer." },
];

export function Merchants() {
  return (
    <section id="merchants" aria-labelledby="merchants-title" className="relative overflow-hidden bg-ink-900 py-24 text-white md:py-32">
      <PageContainer className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <h2 id="merchants-title" className="font-display text-display-lg font-extrabold">
            More students through your door. Free to join for the pilot.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-300">
            You choose the discount and the limits. Perqly brings you verified students from the campus next door and shows you the results.
          </p>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2">
            {benefits.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Icon className="size-7 text-orange-400" aria-hidden />
                <p className="mt-3 font-display text-lg font-bold">{title}</p>
                <p className="mt-1 leading-relaxed text-ink-300">{body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-12 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" variant="accent">
              <Link href="/merchant">Partner with Perqly</Link>
            </Button>
          </div>
        </div>

        {/* Counter scene: the printed QR stand and the cashier's confirm screen */}
        <div
          className="relative mx-auto w-full max-w-md"
          role="img"
          aria-label="Example: a printed Perqly QR stand next to the merchant's counter screen"
        >
          <div className="rounded-2xl bg-white p-6 text-ink-900 shadow-phone">
            <div className="rounded-xl bg-blue-500 p-5 text-white">
              <p className="font-display text-xl font-extrabold">Student? Scan with Perqly</p>
              <p className="mt-1 text-sm text-white">Verified students get today&apos;s deal</p>
              <div className="mt-4 rounded-lg bg-white p-3">
                <QrArt className="mx-auto w-40" seed={23} />
              </div>
              <p className="mt-3 text-center text-xs font-semibold text-white">Example branch QR</p>
            </div>
          </div>

          <div className="relative -mt-10 ml-auto w-[85%] rounded-2xl bg-ink-800 p-5 shadow-phone ring-1 ring-white/10 sm:-mr-8">
            <p className="text-xs font-semibold text-ink-400">Counter screen · Example</p>
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-white p-3 text-ink-900">
              <span className="grid size-10 place-items-center rounded-full bg-blue-500 font-display font-bold text-white" aria-hidden>
                AK
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Ama K.</span>
                <span className="block truncate text-xs text-ink-600">15% off any plate, code 4821</span>
              </span>
              <span className="flex items-center gap-1 rounded-full bg-success px-3 py-1.5 text-xs font-bold text-white">
                <Check className="size-3.5" strokeWidth={3} aria-hidden /> Confirm
              </span>
            </div>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
