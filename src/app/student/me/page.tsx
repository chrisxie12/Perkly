import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  Bell,
  Building2,
  Camera,
  ChevronRight,
  Download,
  Hourglass,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { getMyPassPhotoPath, signPassPhoto } from "@/features/pass-photo/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { formatDate } from "@/features/students/components/status-card";

export const metadata: Metadata = { title: "Me", robots: { index: false } };

function Row({ href, icon: Icon, label, note }: { href: string; icon: typeof Bell; label: string; note?: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-3 border-t border-ink-200 px-3.5 py-2.5 text-[0.9375rem] font-medium first:border-0 hover:bg-ink-50"
    >
      <Icon className="size-5 shrink-0 text-ink-700" aria-hidden />
      <span className="flex-1">
        {label}
        {note && <small className="block text-[0.8125rem] font-normal text-ink-600">{note}</small>}
      </span>
      <ChevronRight className="size-5 text-ink-600" aria-hidden />
    </Link>
  );
}

export default async function MePage() {
  const [ctx, status, photoPath] = await Promise.all([getUserContext(), getMyStudentStatus(), getMyPassPhotoPath()]);
  const photoUrl = await signPassPhoto(photoPath, 120);
  const view = verificationView(status);
  const p = status.profile;
  const name = ctx?.fullName ?? ctx?.firstName ?? "Your account";
  const school = p?.institution_short_name ?? "your school";

  const card =
    view === "verified" ? (
      <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
        <BadgeCheck className="size-5 shrink-0" aria-hidden />
        <div>
          <b className="block">Verified {school} student</b>
          <p className="text-sm text-ink-700">
            {p?.verified_until ? `Valid until ${formatDate(p.verified_until)}.` : "Your verification is active."}
          </p>
        </div>
      </div>
    ) : view === "pending" ? (
      <Link href="/student/verify" className="flex items-start gap-3 rounded-2xl bg-orange-50 p-4 text-orange-800">
        <Hourglass className="size-5 shrink-0" aria-hidden />
        <div>
          <b className="block">Waiting for review</b>
          <p className="text-sm text-ink-700">
            {status.application?.submitted_at
              ? `Sent ${formatDate(status.application.submitted_at)}.`
              : "Your application is with Perqly's reviewers."}
          </p>
        </div>
      </Link>
    ) : (
      <Link
        href={view === "needs_profile" ? "/student/profile" : "/student/verify"}
        className="flex items-start gap-3 rounded-2xl bg-blue-50 p-4 text-blue-800"
      >
        <ShieldCheck className="size-5 shrink-0" aria-hidden />
        <div>
          <b className="block">
            {view === "expired"
              ? "Verification expired"
              : view === "resubmit"
                ? "Changes requested"
                : view === "rejected"
                  ? "Not approved"
                  : "Not verified yet"}
          </b>
          <p className="text-sm text-ink-700">
            {view === "needs_profile" ? "Choose your school to start." : "Get verified to redeem deals."}
          </p>
        </div>
      </Link>
    );

  return (
    <AreaShell area="student">
      <h1 className="sr-only">Me</h1>
      <div className="flex items-center gap-3.5 pb-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={photoUrl} alt="" className="size-16 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            className="grid size-16 shrink-0 place-items-center rounded-full bg-ink-900 font-display text-2xl font-bold text-white"
            aria-hidden
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-2xl leading-tight font-bold">{name}</p>
          <p className="text-sm text-ink-600">
            {p ? [p.programme, p.level].filter(Boolean).join(", ") || p.institution_name : "No school chosen yet"}
          </p>
        </div>
      </div>
      {card}
      <nav aria-label="Your account" className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/70">
        <Row
          href="/student/me/photo"
          icon={Camera}
          label="Photo for your pass"
          note={photoUrl ? "Added" : "Not added yet. Cashiers use it to check it's you"}
        />
        <Row href="/student/profile" icon={Building2} label="School details" note={p ? p.institution_name : "Choose your school"} />
        <Row href="/student/verify" icon={BadgeCheck} label="Verification" />
        <Row href="/account" icon={UserRound} label="Name and account" />
        <Row href="/account/notifications" icon={Bell} label="Notifications" />
      </nav>
      <p className="mt-6 mb-2 text-xs font-bold text-ink-600">Perqly</p>
      <nav aria-label="About Perqly" className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/70">
        <Row href="/install" icon={Smartphone} label="Add Perqly to your home screen" />
        <Row href="/privacy" icon={LockKeyhole} label="Privacy and your ID photos" note="Deleted 30 days after the decision" />
        <Row href="/account" icon={Download} label="Download your data" />
      </nav>
      <div className="mt-6 mb-4">
        <SignOutButton />
      </div>
    </AreaShell>
  );
}
