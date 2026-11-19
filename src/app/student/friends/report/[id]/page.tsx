import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { ReportStudentForm } from "@/features/friends/components/friend-forms";

export const metadata: Metadata = { title: "Report a student", robots: { index: false } };

const UUID = /^[0-9a-f-]{36}$/;

export default async function ReportStudentPage({ params, searchParams }: PageProps<"/student/friends/report/[id]">) {
  const { id } = await params;
  const chat = (await searchParams).chat;
  if (!UUID.test(id)) notFound();
  const chatId = typeof chat === "string" && UUID.test(chat) ? chat : undefined;
  return (
    <AreaShell area="student">
      <Link href="/student/friends" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-700 hover:text-ink-900">
        <ChevronLeft className="size-4" aria-hidden /> Friends
      </Link>
      <PageTitle title="Report a student" description="Tell Perqly support what happened. The student isn't told who reported them." />
      <div className="max-w-xl rounded-3xl bg-white p-5 ring-1 ring-ink-200/70">
        <ReportStudentForm userId={id} chatId={chatId} />
      </div>
    </AreaShell>
  );
}
