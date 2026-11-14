import type { Metadata } from "next";
import { DraftLegalPage } from "@/components/layout/draft-legal-page";

export const metadata: Metadata = { title: "Terms", robots: { index: false } };

export default function TermsPage() {
  return (
    <DraftLegalPage title="Terms of use">
      <p>Perkly&apos;s terms of use for students and merchants are being prepared ahead of the GCTU pilot.</p>
      <p>They will be published here before sign-up opens.</p>
    </DraftLegalPage>
  );
}
