/* Shared by /student/me and the profile panel. */
import * as React from "react";
import Link from "next/link";
import {
  Repeat,
  BookOpen,
  Heart,
  MessageCircle,
  BadgeCheck,
  Bell,
  Building2,
  Camera,
  ChevronRight,
  Download,
  Hourglass,
  LockKeyhole,
  Megaphone,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
} from "lucide-react";
import { getUserContext } from "@/lib/auth/session";
import { AREA_HOME, AREA_LABEL } from "@/lib/auth/paths";
import { areasFor } from "@/lib/auth/roles";
import { getMyPassPhotoPath, signPassPhoto } from "@/features/pass-photo/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { formatDate } from "@/features/students/components/status-card";
import { countUnreadChats } from "@/features/chat/queries";
import { countFriendRequests } from "@/features/friends/queries";
import { getCampusEnabled } from "@/features/campus/queries";
import { getFeatureSwitches } from "@/features/platform/switches";

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

/**
 * Profile and settings: the Me page and the panel that slides in from the left
 * (swipe right on Home, or tap the Perqly logo) both show exactly this.
 */
export async function MeContent() {
  const [ctx, status, photoPath, unreadChats, friendRequests] = await Promise.all([
    getUserContext(),
    getMyStudentStatus(),
    getMyPassPhotoPath(),
    countUnreadChats(),
    countFriendRequests(),
  ]);
  // Campus (C1): a row only while Campus is switched on.
  const [campusOn, switches] = await Promise.all([getCampusEnabled().then((c) => c.posts), getFeatureSwitches()]);
  const photoUrl = await signPassPhoto(photoPath, 120);
  const view = verificationView(status);
  const others = ctx ? areasFor(ctx).filter((a) => a !== "student") : [];
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
    <>
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
        {view === "verified" && switches.friends && (
          <Row
            href="/student/friends"
            icon={Users}
            label="Friends"
            note={
              friendRequests > 0
                ? `${friendRequests} new ${friendRequests === 1 ? "request" : "requests"}`
                : "Classmates, shared deals and chats"
            }
          />
        )}
        <Row href="/student/favourites" icon={Heart} label="Saved shops" />
        <Row href="/student/resources" icon={BookOpen} label="Student resources" note="Free tools, courses and opportunities" />
        {campusOn && <Row href="/student/campus" icon={Megaphone} label="Campus" note="Announcements from your school's organisations" />}
        <Row
          href="/student/messages"
          icon={MessageCircle}
          label="Messages"
          note={unreadChats > 0 ? `${unreadChats} unread` : "Chats with businesses"}
        />
        <Row href="/student/profile" icon={Building2} label="School details" note={p ? p.institution_name : "Choose your school"} />
        <Row href="/student/verify" icon={BadgeCheck} label="Verification" />
        <Row href="/account" icon={UserRound} label="Name and account" note="Your name, sign-in and dark mode" />
        <Row href="/account/notifications" icon={Bell} label="Notifications" />
      </nav>
      <p className="mt-6 mb-2 text-xs font-bold text-ink-600">Perqly</p>
      <nav aria-label="About Perqly" className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/70">
        <Row href="/install" icon={Smartphone} label="Add Perqly to your home screen" />
        <Row href="/privacy" icon={LockKeyhole} label="Privacy and your ID photos" note="Deleted 30 days after the decision" />
        <Row href="/account" icon={Download} label="Download your data" />
      </nav>
      {others.length > 0 && (
        <>
          {/* People with more than one role (a student who also runs a shop) switch here; the old account menu lived in the top bar. */}
          <p className="mt-6 mb-2 text-xs font-bold text-ink-600">Switch to</p>
          <nav aria-label="Switch area" className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/70">
            {others.map((area) => (
              <Row key={area} href={AREA_HOME[area]} icon={Repeat} label={AREA_LABEL[area]} />
            ))}
          </nav>
        </>
      )}
      <div className="mt-6 mb-4">
        <SignOutButton />
      </div>
    </>
  );
}
