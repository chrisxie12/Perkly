import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";

/** The way into Campus from the student Home page (D-C3: no new tab). */
export function CampusHomeCard() {
  return (
    <Link
      href="/student/campus"
      className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-ink-200 hover:bg-ink-50 dark:ring-[#222C3F] dark:hover:bg-[#1A2232]"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-100 text-ink-900 dark:rounded-full dark:bg-[#2B2118] dark:text-orange-400">
        <Megaphone className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink-900 dark:text-white">Campus</span>
        <span className="block text-sm text-ink-600 dark:text-[#94A3B8]">Announcements from your SRC, halls, clubs and departments</span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-ink-600 dark:text-[#94A3B8]" aria-hidden />
    </Link>
  );
}
