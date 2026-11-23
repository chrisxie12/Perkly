import type { Metadata } from "next";
import Link from "next/link";
import { DraftLegalPage } from "@/components/layout/draft-legal-page";
import { LEGAL_CONTACT_EMAIL } from "@/config/legal";

export const metadata: Metadata = {
  title: "Delete your Perqly account",
  description: "How to ask Perqly to delete your account and data, with or without the app.",
};

/**
 * Public account deletion page (Google Play asks for a web link that works without the app).
 * Part of the draft legal set: every statement must match the privacy notice and what support
 * actually does today (docs/ACCOUNT_DELETION_RUNBOOK.md). Change them together.
 */
export default function DeleteAccountPage() {
  const h2 = "pt-4 font-display text-2xl font-bold text-ink-900";
  const link = "font-semibold text-blue-700 underline underline-offset-2";
  return (
    <DraftLegalPage title="Delete your Perqly account">
      <p>
        You can ask Perqly to delete your account and the personal data linked to it at any time. You don&apos;t need the app to do this.
      </p>

      <h2 className={h2}>In the app or on the website</h2>
      <ol className="list-decimal space-y-2 pl-6">
        <li>Sign in to Perqly.</li>
        <li>
          Go to{" "}
          <Link href="/account" className={link}>
            Your account
          </Link>
          .
        </li>
        <li>
          Under <strong>Delete your account</strong>, choose <strong>Ask to delete my account</strong>.
        </li>
      </ol>
      <p>You can cancel the request from the same place until it has been carried out.</p>

      <h2 className={h2}>Without the app</h2>
      <p>
        Email{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=Delete%20my%20Perqly%20account`} className={link}>
          {LEGAL_CONTACT_EMAIL}
        </a>{" "}
        from the email address you use for Perqly, with the subject &ldquo;Delete my Perqly account&rdquo;. Perqly only acts on requests
        sent from the account&apos;s own email address, so nobody else can delete your account.
      </p>

      <h2 className={h2}>What happens next</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>A person at Perqly carries out the deletion and emails you when it&apos;s done.</li>
        <li>Your name and contact details are removed, and you can no longer sign in.</li>
        <li>
          Photos of your student ID and your selfie are deleted 30 days after your verification is decided, if they haven&apos;t been
          already.
        </li>
        <li>
          A record of discounts you used is kept without your name, because it&apos;s the business&apos;s and Perqly&apos;s record of
          discounts given.
        </li>
        <li>Perqly&apos;s encrypted backups are kept for 14 days, so deleted data can remain in a backup for up to 14 days.</li>
      </ul>
      <p>
        Before you ask, you can{" "}
        <Link href="/account" className={link}>
          download your data
        </Link>{" "}
        from Your account. The{" "}
        <Link href="/privacy" className={link}>
          privacy notice
        </Link>{" "}
        explains what Perqly collects and why.
      </p>
    </DraftLegalPage>
  );
}
