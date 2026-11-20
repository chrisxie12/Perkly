import { ChevronDown } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";

export const merchantFaqs = [
  {
    q: "How do businesses join?",
    a: "Merchant sign-up is open, and joining is free during the pilot. You set up your business, add your branches, create your offer and print your branch QR.",
  },
  {
    q: "What does it cost?",
    a: "Nothing during the pilot. You set your own original price and student price for each offer, and students pay you directly at the counter.",
  },
];

export const faqs = [
  {
    q: "Is Perqly free for students?",
    a: "Yes. Students never pay to use Perqly. Businesses join free during the pilot too.",
  },
  {
    q: "Who can join?",
    a: "Students at the institutions Perqly covers. Perqly is live for GCTU students now, and more Ghanaian tertiary institutions come next.",
  },
  {
    q: "How does verification work?",
    a: "Sign up with your personal email, then send Perqly a verification request with your student ID number, a photo of your student ID and a selfie. Adding a school email is optional. Perqly's verification team checks your ID against your selfie and approves it, and deals unlock as soon as they do.",
  },
  {
    q: "Do I need to download an app?",
    a: "No. Perqly runs in your phone's browser. You can add it to your home screen in two taps so it opens like an app, without the Play Store or App Store.",
  },
  {
    q: "How do I use a discount at a shop?",
    a: "Open Perqly, scan the Perqly QR at the counter, pick what you bought and show the live pass on your screen. The cashier checks your name and pass code and confirms, you confirm, and you pay the shop the student price directly.",
  },
  {
    q: "My school isn't on Perqly yet. What can I do?",
    a: "Perqly is live at GCTU now, and we're adding schools one by one. Leave your email at the top of this page and we'll tell you when your campus opens.",
  },
  {
    q: "Is my information safe?",
    a: "Only the Perqly reviewer checking your request can see your ID photo, every view is logged, and ID photos are deleted 30 days after a decision. Merchants see your first name and photo when you redeem, never your phone number or email.",
  },
];

export function Faq({
  items = faqs,
  title = "Questions, answered.",
  intro = "The things students ask us most.",
}: {
  items?: { q: string; a: string }[];
  title?: string;
  intro?: string;
}) {
  return (
    <section id="faq" aria-labelledby="faq-title" className="py-14 sm:py-20 md:py-32">
      <PageContainer className="grid grid-cols-1 gap-6 sm:gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="faq-title" className="font-display text-display-lg font-extrabold">
            {title}
          </h2>
          <p className="mt-5 max-w-sm text-lg leading-relaxed text-ink-600">{intro}</p>
        </div>
        {/* An iOS-style grouped list. Native <details>: accessible, keyboard-friendly and needs no JavaScript */}
        <div className="glass glass-card self-start px-5 md:px-7">
          {items.map((item) => (
            <details key={item.q} name="faq" className="group border-b border-ink-900/10 last:border-b-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-lg font-semibold tracking-tight text-ink-900 transition-colors hover:text-blue-600 md:text-xl [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-900/[0.06] text-ink-700 transition-[transform,background-color,color] duration-500 ease-[cubic-bezier(0.2,0.9,0.3,1.25)] group-open:rotate-180 group-open:bg-blue-500 group-open:text-white">
                  <ChevronDown className="size-4" aria-hidden />
                </span>
              </summary>
              <p className="max-w-[65ch] pr-12 pb-5 text-base leading-relaxed text-ink-600">{item.a}</p>
            </details>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
