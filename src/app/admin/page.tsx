import type { Metadata } from "next";
import { ComingSoonShell } from "@/components/layout/coming-soon-shell";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <ComingSoonShell
      area="Perkly staff"
      title="Perkly staff area."
      description="Platform administration for Perkly staff. It is not built yet, and it will require a staff account with two-factor sign-in."
      points={["Merchant verification queue", "Offer moderation", "Institution and reviewer setup", "Audit log"]}
    />
  );
}
