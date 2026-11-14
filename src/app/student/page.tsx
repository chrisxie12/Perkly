import type { Metadata } from "next";
import { Store } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { getMyStudentStatus } from "@/features/students/queries";
import { VerificationStatusCard } from "@/features/students/components/status-card";
import { studentNav } from "./student-nav";

export const metadata: Metadata = { title: "Student home", robots: { index: false } };

export default async function StudentHomePage() {
  const [ctx, status] = await Promise.all([getUserContext(), getMyStudentStatus()]);
  return (
    <AreaShell area="Student" nav={studentNav}>
      <PageTitle title={ctx?.firstName ? `Hi, ${ctx.firstName}.` : "Welcome to Perqly."} />
      <div className="grid gap-6 lg:grid-cols-2">
        <VerificationStatusCard status={status} />
        <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink-200/70">
          <span className="grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-700">
            <Store className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 font-display text-xl font-bold tracking-tight">Deals near campus</h2>
          <p className="mt-2 leading-relaxed text-ink-700">
            The marketplace opens with the GCTU pilot. When it does, you&apos;ll see businesses near your campus, their regular and student
            prices, and how to redeem.
          </p>
        </section>
      </div>
    </AreaShell>
  );
}
