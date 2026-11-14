import type { Metadata } from "next";
import Link from "next/link";
import { ComingSoonShell } from "@/components/layout/coming-soon-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "For merchants", robots: { index: false } };

export default function MerchantPage() {
  return (
    <ComingSoonShell
      area="Merchants"
      title="Merchant sign-up opens soon. Joining is free during the pilot."
      description="This is where businesses will create their profile, add branches, publish student offers and confirm passes at the counter."
      points={[
        "Set up your business and branches",
        "Create an offer with your own limits",
        "Print your branch QR for the counter",
        "Confirm student passes from any phone",
      ]}
      action={
        <Button asChild variant="secondary">
          <Link href="/#merchants">How it works for merchants</Link>
        </Button>
      }
    />
  );
}
