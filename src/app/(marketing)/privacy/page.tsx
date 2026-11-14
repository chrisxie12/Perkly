import type { Metadata } from "next";
import { DraftLegalPage } from "@/components/layout/draft-legal-page";

export const metadata: Metadata = { title: "Privacy", robots: { index: false } };

export default function PrivacyPage() {
  return (
    <DraftLegalPage title="Privacy">
      <p>
        Perqly&apos;s privacy policy is being prepared ahead of the GCTU pilot, together with registration with Ghana&apos;s Data Protection
        Commission under the Data Protection Act, 2012 (Act 843).
      </p>
      <p>
        Perqly does not collect any personal information yet. Sign-up and verification are not open, and this site sets no tracking cookies.
      </p>
    </DraftLegalPage>
  );
}
