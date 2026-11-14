import { BadgeCheck, MapPin, PiggyBank, Smartphone, Download } from "lucide-react";
import { PageContainer, SectionHeading } from "@/components/layout/page-container";

const smallCards = [
  {
    icon: BadgeCheck,
    title: "Only verified students",
    body: "Your school confirms you, so merchants can offer prices they'd never give the general public.",
  },
  {
    icon: MapPin,
    title: "Close to campus",
    body: "Businesses around your campus, with branch addresses, opening hours and directions.",
  },
  {
    icon: Smartphone,
    title: "Any phone, any browser",
    body: "Android or iPhone. Perqly runs in your browser and stays light on data.",
  },
  {
    icon: Download,
    title: "Installs like an app",
    body: "Add Perqly to your home screen in two taps. No Play Store, no App Store, no big download.",
  },
];

export function StudentBenefits() {
  return (
    <section id="students" aria-labelledby="students-title" className="py-24 md:py-32">
      <PageContainer>
        <SectionHeading id="students-title" title="Built for how students actually spend." />

        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-6 md:grid-rows-[auto_auto]">
          <div className="grain relative overflow-hidden rounded-2xl bg-blue-500 p-8 text-white md:col-span-3 md:row-span-2 md:p-10">
            <p className="font-display text-display-lg font-extrabold">Free for students. Always.</p>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-white">
              You never pay to use Perqly. Businesses pay to reach verified students, and that pays for the platform.
            </p>
            <div className="mt-10 flex items-center gap-4 rounded-xl bg-white/12 p-4 ring-1 ring-white/20 md:mt-16">
              <PiggyBank className="size-9 shrink-0 text-orange-300" aria-hidden />
              <p className="text-[0.9375rem] leading-snug">
                <span className="font-semibold text-white">Your savings, counted.</span> Perqly keeps a running total of what you&apos;ve
                saved this semester.
              </p>
            </div>
          </div>

          {smallCards.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl bg-white p-7 shadow-soft ring-1 ring-ink-200/70 md:col-span-3 lg:col-span-3 xl:col-span-3"
            >
              <Icon className="size-8 text-blue-500" aria-hidden />
              <h3 className="mt-5 font-display text-xl font-bold tracking-tight">{title}</h3>
              <p className="mt-2 leading-relaxed text-ink-600">{body}</p>
            </div>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
