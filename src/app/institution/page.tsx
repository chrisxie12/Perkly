import type { Metadata } from "next";
import { ComingSoonShell } from "@/components/layout/coming-soon-shell";

export const metadata: Metadata = { title: "For institutions", robots: { index: false } };

export default function InstitutionPage() {
  return (
    <ComingSoonShell
      area="Institutions"
      title="Where your reviewers approve your students."
      description="Each partner institution appoints reviewers who approve or reject their own students' verification requests here. Access is set up for each school after it signs an agreement with Perqly."
      points={[
        "A queue of your institution's requests only",
        "Approve, reject or ask for more information",
        "Every decision is logged",
        "Manage your institution's reviewers",
      ]}
    />
  );
}
