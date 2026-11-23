import type { Metadata } from "next";
import Link from "next/link";
import { DraftLegalPage } from "@/components/layout/draft-legal-page";
import { LEGAL_CONTACT_EMAIL, OPERATOR_NAME, TERMS_VERSION } from "@/config/legal";

export const metadata: Metadata = { title: "Terms", robots: { index: false } };

/**
 * DRAFT Terms of use, written from how the app works today. Not final until the operator's
 * registered business name, Data Protection Commission registration and a legal review are
 * complete (founder decision 2026-11-23). Every statement must match the code; change both
 * together, and change TERMS_VERSION in src/config/legal.ts when the meaning changes.
 */
export default function TermsPage() {
  const h2 = "pt-4 font-display text-2xl font-bold text-ink-900";
  return (
    <DraftLegalPage title="Terms of use">
      <p>
        These terms explain how Perqly works and what we expect from you when you use it. Perqly is run by {OPERATOR_NAME}. This is a draft
        (version {TERMS_VERSION}) and is being reviewed before it takes effect.
      </p>

      <h2 className={h2}>What Perqly is</h2>
      <p>
        Perqly is a service that lets verified tertiary students get student prices at partner businesses. Businesses set their own student
        prices. Perqly doesn&apos;t sell the goods or services: you buy them from the business and pay the business directly.
      </p>

      <h2 className={h2}>Who can use it</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          Anyone can create a student account, but student prices are only for students Perqly has verified. During the pilot, Perqly
          verifies students of Ghana Communication Technology University (GCTU).
        </li>
        <li>Businesses use Perqly under a separate business agreement, which they accept when they join.</li>
        <li>You need one account. Don&apos;t create accounts for other people or use someone else&apos;s account.</li>
      </ul>

      <h2 className={h2}>Verification</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          To be verified, you send your student ID number, a photo of your student ID card and a selfie. Everything you send must be true
          and yours.
        </li>
        <li>
          Perqly&apos;s reviewers decide each application, usually within 2 working days. If it isn&apos;t approved, you&apos;ll see why and
          can send a new application.
        </li>
        <li>A student ID can be verified on one Perqly account only.</li>
        <li>
          Verification lasts for a set period, shown on your account. When it ends, you&apos;ll need to verify again to keep student prices.
        </li>
        <li>Until you&apos;re verified you can browse deals and prices, but you can&apos;t redeem them.</li>
      </ul>

      <h2 className={h2}>Using student prices</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Redeem only for yourself, in person, with your own phone and your own pass.</li>
        <li>
          Each deal may have limits that the business sets, such as how often you can use it and the days and times it runs. Those limits
          are shown on the deal.
        </li>
        <li>
          Businesses can change or end their deals. A deal applies only while it&apos;s live and running when you redeem it at the counter.
        </li>
        <li>
          Questions about the goods or services themselves, their quality or refunds are between you and the business. You can report a
          problem with a redemption in Perqly, and Perqly will look into it.
        </li>
      </ul>

      <h2 className={h2}>Messages, photos and ratings</h2>
      <p>
        You&apos;re responsible for what you send in Perqly. Don&apos;t send anything unlawful, abusive, misleading or that isn&apos;t yours
        to share. You let Perqly store and show what you send to the people it&apos;s meant for, such as the business you message or other
        students who read ratings. You can report a chat, and Perqly may remove content or limit accounts that break these terms.
      </p>

      <h2 className={h2}>What isn&apos;t allowed</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Sending false documents, or verifying for someone else.</li>
        <li>Sharing, selling or lending your pass, or redeeming for others.</li>
        <li>Trying to get around limits, interfere with Perqly, or reach data that isn&apos;t yours.</li>
        <li>Harassing businesses, their staff or other students.</li>
      </ul>
      <p>Perqly may suspend or close accounts that break these rules.</p>

      <h2 className={h2}>Your account and your data</h2>
      <p>
        How Perqly handles your personal data is explained in the{" "}
        <Link href="/privacy" className="font-semibold text-blue-700 underline underline-offset-2">
          privacy notice
        </Link>
        . You can download your data or ask to delete your account from Your account at any time.
      </p>

      <h2 className={h2}>The service</h2>
      <p>
        Perqly is in a pilot and will change as it grows. Perqly works to keep it running and accurate, but can&apos;t promise it will
        always be available or that every business will honour every deal. Perqly may add, change or remove features.
      </p>

      <h2 className={h2}>Changes to these terms</h2>
      <p>
        When these terms change in a way that matters, Perqly will tell you in the app and may ask you to accept the new version. The
        version you accepted is recorded on your account.
      </p>

      <h2 className={h2}>Law and contact</h2>
      <p>
        These terms are governed by the laws of Ghana. Questions:{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-semibold text-blue-700 underline underline-offset-2">
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
    </DraftLegalPage>
  );
}
