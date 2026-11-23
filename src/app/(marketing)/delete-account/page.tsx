import type { Metadata } from "next";
import Link from "next/link";
import { DraftLegalPage } from "@/components/layout/draft-legal-page";
import { LEGAL_CONTACT_EMAIL } from "@/config/legal";
import { DELETED_ITEMS, KEPT_ITEMS } from "@/features/account/deletion";

export const metadata: Metadata = {
  title: "Delete your Perqly account",
  description: "How to ask Perqly to delete your account and data, with or without the app.",
};

/**
 * Public account deletion page (Google Play asks for a web link that works without the app).
 * Part of the draft legal set: every statement must match the privacy notice and what
 * admin_complete_account_deletion does (see docs/ACCOUNT_DELETION_RUNBOOK.md). The lists come
 * from features/account/deletion.ts, which the confirmation email uses too.
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
        <li>A person at Perqly carries out the deletion within 30 days of your request, and emails you when it&apos;s done.</li>
        <li>
          If you own a business on Perqly or are the only owner of a Campus club, it needs a new owner first. Perqly will contact you about
          this.
        </li>
        <li>After that, you can no longer sign in.</li>
      </ul>

      <h3 className="pt-2 font-semibold text-ink-900">Deleted</h3>
      <ul className="list-disc space-y-2 pl-6">
        {DELETED_ITEMS.map((item) => (
          <li key={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</li>
        ))}
      </ul>

      <h3 className="pt-2 font-semibold text-ink-900">Kept</h3>
      <ul className="list-disc space-y-2 pl-6">
        {KEPT_ITEMS.map((item) => (
          <li key={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</li>
        ))}
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
