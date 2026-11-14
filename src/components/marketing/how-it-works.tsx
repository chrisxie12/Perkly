import { BadgeCheck, Clock3, MapPin, ScanLine } from "lucide-react";
import { PageContainer, SectionHeading } from "@/components/layout/page-container";
import { QrArt } from "@/components/marketing/qr-art";

function VerifyVignette() {
  return (
    <div className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink-200">
      <p className="text-xs font-semibold text-ink-600">Verification request · GCTU</p>
      <ul className="mt-3 space-y-2 text-sm font-medium">
        <li className="flex items-center gap-2">
          <BadgeCheck className="size-4 text-success" aria-hidden /> School email confirmed
        </li>
        <li className="flex items-center gap-2">
          <BadgeCheck className="size-4 text-success" aria-hidden /> Student ID and photos added
        </li>
        <li className="flex items-center gap-2 text-ink-700">
          <Clock3 className="size-4 text-orange-600" aria-hidden /> Waiting for your school
        </li>
      </ul>
    </div>
  );
}

function NearbyVignette() {
  const deals = [
    { name: "Inkwell Print Hub", deal: "GH₵1 off every 10 pages", distance: "250 m" },
    { name: "Sip Spot Juice Bar", deal: "Second smoothie half price", distance: "600 m" },
  ];
  return (
    <ul className="space-y-2">
      {deals.map((d) => (
        <li key={d.name} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-soft ring-1 ring-ink-200">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 font-display font-extrabold text-blue-700">
            {d.name[0]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{d.deal}</span>
            <span className="block truncate text-xs text-ink-600">{d.name}</span>
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-ink-700">
            <MapPin className="size-3.5" aria-hidden />
            {d.distance}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ScanVignette() {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink-200">
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
    title: "Get verified by your school",
    body: "Sign up, then send your school a verification request: school email code, student ID number, ID photo and a selfie. Your school approves it.",
    vignette: <VerifyVignette />,
  },
  {
    title: "Find a deal near campus",
    body: "Browse discounts from food spots, print shops, barbers and more, sorted by how close they are to your campus.",
    vignette: <NearbyVignette />,
  },
  {
    title: "Scan the QR at the counter",
    body: "Every partner shop has a Perkly QR. Scan it, choose your deal and show the live pass on your phone. That's it.",
    vignette: <ScanVignette />,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="py-24 md:py-32">
      <PageContainer>
        <SectionHeading
          id="how-title"
          title="Three steps from student to student price."
          intro="No coupons to print and no codes to remember. Your phone is your pass."
        />
        <ol className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col rounded-2xl bg-ink-100 p-6 md:p-7">
              <span className="font-display text-6xl leading-none font-extrabold text-blue-500" aria-hidden>
                {index + 1}
              </span>
              <h3 className="mt-6 font-display text-2xl font-bold tracking-tight">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-3 leading-relaxed text-ink-700">{step.body}</p>
              <div className="mt-auto pt-8">{step.vignette}</div>
            </li>
          ))}
        </ol>
      </PageContainer>
    </section>
  );
}
