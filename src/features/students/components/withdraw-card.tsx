import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { withdrawVerificationApplication } from "../actions";
import type { ApplicationStatus } from "../status";

const copy: Partial<Record<ApplicationStatus, { title: string; body: string; button: string }>> = {
  draft: {
    title: "Picked the wrong school, or not ready?",
    body: "Cancel this application to change your school or start over. Photos you uploaded are deleted within 30 days.",
    button: "Cancel application",
  },
  submitted: {
    title: "Need to change something?",
    body: "Withdraw it, fix your details, then send a new application. Reviewers won't see this one any more.",
    button: "Withdraw application",
  },
  resubmission_requested: {
    title: "Can't make the change?",
    body: "If you picked the wrong school or want to start over, withdraw this application and begin a new one.",
    button: "Withdraw application",
  },
};

/** Lets a student close their own open application. The database decides whether it's still open. */
export function WithdrawCard({
  applicationId,
  status,
  className,
}: {
  applicationId: string;
  status: ApplicationStatus;
  className?: string;
}) {
  const text = copy[status];
  if (!text) return null;
  return (
    <Card className={className}>
      <p className="font-semibold text-ink-900">{text.title}</p>
      <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-600">{text.body}</p>
      <form action={withdrawVerificationApplication} className="mt-4">
        <input type="hidden" name="applicationId" value={applicationId} />
        <SubmitButton variant="secondary">{text.button}</SubmitButton>
      </form>
    </Card>
  );
}
