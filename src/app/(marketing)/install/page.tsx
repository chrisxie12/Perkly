import type { Metadata } from "next";
import { MoreVertical, PlusSquare, Share, Smartphone } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { InstallButton } from "@/components/marketing/install-button";

export const metadata: Metadata = {
  title: "Install Perqly",
  description: "Add Perqly to your home screen on Android or iPhone. No app store needed.",
};

const guides = [
  {
    platform: "Android",
    browser: "Chrome",
    steps: [
      { icon: Smartphone, text: "Open the Perqly website in Chrome." },
      { icon: MoreVertical, text: "Tap the ⋮ menu in the top-right corner." },
      { icon: PlusSquare, text: "Tap “Install app” (or “Add to Home screen”), then “Install”." },
      { icon: Smartphone, text: "Open Perqly from your home screen. It runs full-screen, like any app." },
    ],
  },
  {
    platform: "iPhone",
    browser: "Safari",
    steps: [
      { icon: Smartphone, text: "Open the Perqly website in Safari. Other iPhone browsers may not offer this option." },
      { icon: Share, text: "Tap the Share button (the square with an arrow pointing up)." },
      { icon: PlusSquare, text: "Scroll down and tap “Add to Home Screen”, then “Add”." },
      { icon: Smartphone, text: "Open Perqly from your Home Screen icon. Notifications only work when opened this way." },
    ],
  },
];

export default function InstallPage() {
  return (
    <section className="pt-32 pb-24 md:pt-40">
      <PageContainer>
        <h1 className="max-w-3xl font-display text-display-lg font-extrabold">Put Perqly on your home screen.</h1>
        <p className="mt-5 max-w-[48ch] text-lg leading-relaxed text-ink-600">
          Perqly is a web app, so there&apos;s nothing to download from an app store. Installing it takes two taps and very little data.
        </p>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {guides.map((guide) => (
            <article key={guide.platform} className="glass glass-card p-7 md:p-9">
              <h2 className="font-display text-2xl font-extrabold">
                {guide.platform} <span className="font-semibold text-ink-600">with {guide.browser}</span>
              </h2>
              <ol className="mt-7 space-y-5">
                {guide.steps.map((step, index) => (
                  <li key={step.text} className="flex gap-4">
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-500 font-display font-bold text-white"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span className="pt-1.5 leading-relaxed text-ink-700">{step.text}</span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4">
          <InstallButton hideFallback />
          <p className="max-w-[52ch] text-ink-600">
            On phones that support one-tap install, the button above installs Perqly directly. Already installed? Open Perqly from your home
            screen.
          </p>
        </div>
      </PageContainer>
    </section>
  );
}
