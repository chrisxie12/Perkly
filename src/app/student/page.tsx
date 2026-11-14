import type { Metadata } from "next";
import Link from "next/link";
import { ComingSoonShell } from "@/components/layout/coming-soon-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "For students", robots: { index: false } };

export default function StudentPage() {
  return (
    <ComingSoonShell
      area="Students"
      title="You're in. Verification opens with the GCTU pilot."
      description="Your account is ready. This is where you'll send your verification request to your school and find deals near campus. Those steps aren't open yet."
      points={[
        "Choose your school and campus",
        "Send your school a verification request",
        "Browse deals near your campus",
        "Scan a shop's QR and show your live pass",
      ]}
      action={
        <Button asChild>
          <Link href="/install">Install Perqly now</Link>
        </Button>
      }
    />
  );
}
