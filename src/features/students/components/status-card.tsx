import Link from "next/link";
import { BadgeCheck, Clock3, FileWarning, ShieldAlert, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REJECTION_REASONS, REVIEW_PROMISE, stateLabel, verificationView, type StudentStatus } from "../status";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" });

export function formatDate(value: string | null | undefined) {
  return value ? dateFormat.format(new Date(value)) : "";
}

/** Summary of where the student stands, with the next step. */
export function VerificationStatusCard({ status, showAction = true }: { status: StudentStatus; showAction?: boolean }) {
  const view = verificationView(status);
  const school = status.profile?.institution_short_name ?? "your school";
  const config = {
    needs_profile: {
      icon: ShieldQuestion,
      tone: "bg-blue-50 text-blue-700",
      text: "Add your school to get started.",
      action: { href: "/student/profile", label: "Add your school" },
    },
    apply: {
      icon: ShieldQuestion,
      tone: "bg-blue-50 text-blue-700",
      text: `Get verified by ${school}. Verified students get student prices at Perqly partner businesses.`,
      action: { href: "/student/verify", label: "Start verification" },
    },
    pending: {
      icon: Clock3,
      tone: "bg-orange-100 text-orange-800",
      text: `Your application is with Perqly's reviewers. Sent ${formatDate(status.application?.submitted_at)}. Expect a decision ${REVIEW_PROMISE}.`,
      action: { href: "/student/verify", label: "View application" },
    },
    resubmit: {
      icon: FileWarning,
      tone: "bg-orange-100 text-orange-800",
      text: `${school}'s reviewer asked you to change something.`,
      action: { href: "/student/verify", label: "See what to change" },
    },
    rejected: {
      icon: FileWarning,
      tone: "bg-orange-100 text-orange-800",
      text: `${REJECTION_REASONS[status.application?.decision_reason ?? "other"] ?? "Your application wasn't approved."} You can fix this and send a new application.`,
      action: { href: "/student/verify", label: "Send a new application" },
    },
    verified: {
      icon: BadgeCheck,
      tone: "bg-green-50 text-success",
      text: `You're verified as a ${school} student until ${formatDate(status.profile?.verified_until)}.`,
      action: null,
    },
    expired: {
      icon: Clock3,
      tone: "bg-orange-100 text-orange-800",
      text: "Your verification has expired. Verify again to keep your student prices.",
      action: { href: "/student/verify", label: "Renew verification" },
    },
    suspended: {
      icon: ShieldAlert,
      tone: "bg-orange-100 text-orange-800",
      text: "Your account is suspended. Contact Perqly support.",
      action: null,
    },
  }[view];
  const Icon = config.icon;

  return (
    <section aria-labelledby="verification-status" className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink-200/70">
      <div className="flex items-start gap-4">
        <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${config.tone}`}>
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-600">Student verification</p>
          <h2 id="verification-status" className="font-display text-xl font-bold tracking-tight">
            {stateLabel(status)}
          </h2>
          <p className="mt-2 leading-relaxed text-ink-700">{config.text}</p>
          {showAction && config.action && (
            <Button asChild className="mt-4">
              <Link href={config.action.href}>{config.action.label}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
