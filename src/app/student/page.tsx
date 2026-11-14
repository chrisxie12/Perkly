import type { Metadata } from "next";
import Link from "next/link";
import { ComingSoonShell } from "@/components/layout/coming-soon-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "For students", robots: { index: false } };

export default function StudentPage() {
  return (
    <ComingSoonShell
      area="Students"
      title="Student sign-up opens with the GCTU pilot."
      description="This is where you'll sign up, send your verification request to your school, and find deals near campus. It isn't open yet."
      points={[
        "Sign up with your email or phone number",
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
