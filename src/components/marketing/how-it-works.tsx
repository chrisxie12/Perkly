import { BadgeCheck, Bell, Clock3, Compass, GraduationCap, House, MapPin, MessageCircle, ScanLine, Ticket } from "lucide-react";
import { PageContainer, SectionHeading } from "@/components/layout/page-container";
import { QrArt } from "@/components/marketing/qr-art";

function VerifyVignette() {
  return (
    <div className="rounded-2xl bg-white/80 p-4 md:p-6">
      <p className="text-xs font-semibold text-ink-600">Verification request · GCTU</p>
      <ul className="mt-3 space-y-2 text-sm font-medium">
        <li className="flex items-center gap-2">
          <BadgeCheck className="size-4 text-success" aria-hidden /> Student ID number added
        </li>
        <li className="flex items-center gap-2">
          <BadgeCheck className="size-4 text-success" aria-hidden /> ID photo and selfie added
        </li>
        <li className="flex items-center gap-2 text-ink-700">
          <Clock3 className="size-4 text-orange-600" aria-hidden /> Waiting for review
        </li>
      </ul>
    </div>
  );
}

/** A small Home screen in the app's current frame: photo top left, Notifications and Chat top right, five tabs below. */
function NearbyVignette() {
  const deals = [
    { name: "Paperclip Print Corner", deal: "GH₵1 off every 10 pages", distance: "Tesano" },
    { name: "Sip Spot Juice Bar", deal: "Second smoothie half price", distance: "Abelemkpe" },
  ];
  const tabs = [
    { icon: House, label: "Home", current: true },
    { icon: Compass, label: "Explore" },
    { icon: ScanLine, label: "Scan" },
    { icon: Ticket, label: "My Deals" },
    { icon: GraduationCap, label: "Campus" },
  ];
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-ink-600">Example deals, not real businesses</p>
      <div aria-hidden className="rounded-[1.5rem] bg-paper p-4 ring-1 ring-ink-900/5">
        <div className="flex items-center justify-between">
          <span className="grid size-8 place-items-center rounded-full bg-blue-50 font-display text-sm font-bold text-blue-700">A</span>
          <span className="flex gap-3 text-ink-700">
            <Bell className="size-4" />
            <MessageCircle className="size-4" />
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {deals.map((d) => (
            <li key={d.name} className="flex items-center gap-3 rounded-2xl bg-white p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 font-display font-extrabold text-blue-700">
                {d.name[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug font-bold">{d.deal}</span>
                <span className="block truncate text-xs text-ink-600">{d.name}</span>
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-ink-700">
                <MapPin className="size-3.5" />
                {d.distance}
              </span>
            </li>
          ))}
        </ul>
        <ul className="mt-3 grid grid-cols-5 rounded-full bg-white py-2">
          {tabs.map(({ icon: Icon, label, current }) => (
            <li
              key={label}
              className={`flex flex-col items-center gap-0.5 text-[0.5625rem] font-medium ${current ? "text-blue-600" : "text-ink-600"}`}
            >
              <Icon className="size-4" />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only">
        Example of the Perqly Home screen: two deals near campus, with Home, Explore, Scan, My Deals and Campus tabs at the bottom.
      </p>
    </div>
  );
}

function ScanVignette() {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white/80 p-4 md:p-6">
      <QrArt className="w-20 shrink-0" seed={3} />
      <div>
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <ScanLine className="size-4 text-blue-500" aria-hidden /> Scan, pick the deal
        </p>
        <p className="mt-1 text-sm text-ink-600">Then show your live pass. The cashier confirms it.</p>
      </div>
    </div>
  );
}

const steps = [
  {
    title: "Get verified as a student",
    body: "Sign up with your personal email, then send Perqly a verification request: student ID number, ID photo and a selfie. A school email is optional. Perqly checks it and approves you.",
    vignette: <VerifyVignette />,
  },
  {
    title: "Find a deal near campus",
    body: "Browse student prices from food spots, print shops, barbers and more on Home, or open Explore to see them on a map. Search, filter by category and save your favourite shops.",
    vignette: <NearbyVignette />,
  },
  {
    title: "Scan the QR at the counter",
    body: "After you're served, scan the shop's Perqly QR and pick what you bought. The cashier confirms, you confirm, and you pay the shop the student price directly.",
    vignette: <ScanVignette />,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="py-14 sm:py-20 md:py-32">
      <PageContainer>
        <SectionHeading
          id="how-title"
          title="Three steps from student to student price."
          intro="No coupons to print and no codes to remember. Your phone is your pass."
        />
        <ol className="relative mt-8 grid grid-cols-1 gap-4 sm:mt-16 sm:gap-6 md:grid-cols-3">
          {/* The path from step 1 to step 3, drawn as you scroll */}
          <span
            aria-hidden
            className="absolute top-[3.4rem] right-[16%] left-[16%] hidden h-1 overflow-hidden rounded-full bg-ink-200 md:block"
          >
            <span className="progress-x block h-full w-full rounded-full bg-gradient-to-r from-blue-500 to-orange-500" />
          </span>
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="reveal group glass glass-card relative flex flex-col overflow-hidden p-5 sm:p-6 md:p-7"
              style={{ animationRange: `entry 0% entry ${45 + index * 15}%` }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-gradient-to-br from-blue-100/70 to-transparent transition-transform duration-500 group-hover:scale-125"
              />
              <span
                className="relative grid size-14 place-items-center rounded-2xl bg-blue-500 font-display text-3xl leading-none font-extrabold text-white shadow-soft"
                aria-hidden
              >
                {index + 1}
              </span>
              <h3 className="relative mt-6 font-display text-2xl font-bold tracking-tight">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-3 leading-relaxed text-ink-700">{step.body}</p>
              <div className="mt-auto pt-5 sm:pt-8">{step.vignette}</div>
            </li>
          ))}
        </ol>
      </PageContainer>
    </section>
  );
}
