import { Hero } from "@/components/marketing/hero";
import { CategoryMarquee } from "@/components/marketing/category-marquee";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { ExampleOffers } from "@/components/marketing/example-offers";
import { StudentBenefits } from "@/components/marketing/student-benefits";
import { Verification } from "@/components/marketing/verification";
import { Merchants } from "@/components/marketing/merchants";
import { ReceiptFacts } from "@/components/marketing/receipt-facts";
import { Faq, faqs } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <CategoryMarquee />
      <HowItWorks />
      <ExampleOffers />
      <StudentBenefits />
      <Verification />
      <Merchants />
      <ReceiptFacts />
      <Faq />
      <FinalCta />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
