import type { Metadata } from "next";
import { AreaShell } from "@/components/layout/area-shell";
import { MeContent } from "@/features/students/app/me-content";

export const metadata: Metadata = { title: "Me", robots: { index: false } };

export default function MePage() {
  return (
    <AreaShell area="student">
      <h1 className="sr-only">Me</h1>
      <MeContent />
    </AreaShell>
  );
}
