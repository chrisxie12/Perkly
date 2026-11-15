import type { Metadata } from "next";
import { Merchants } from "@/components/marketing/merchants";
import { Faq, merchantFaqs } from "@/components/marketing/faq";

export const metadata: Metadata = {
  title: "For businesses",
  description: "Bring verified GCTU students through your door. Free to join during the pilot. You set the student price.",
};

export default function MerchantsPage() {
  return (
    <>
      {/* Keeps the fixed site header on a light background above the dark section */}
      <div className="h-20 md:h-24" aria-hidden />
      <Merchants />
      <Faq items={merchantFaqs} title="Questions from businesses." intro="What shop owners ask us most." />
    </>
  );
}
