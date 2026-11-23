import type { Metadata } from "next";
import Link from "next/link";
import { DraftLegalPage } from "@/components/layout/draft-legal-page";
import { LEGAL_CONTACT_EMAIL, OPERATOR_NAME, TERMS_VERSION } from "@/config/legal";

export const metadata: Metadata = { title: "Privacy", robots: { index: false } };

/**
 * DRAFT privacy notice: what the app collects today, as built. Not final until the operator's
 * registered business name, Data Protection Commission registration and a legal review are
 * complete (founder decision 2026-11-23). Every statement here must match the code; change both
 * together, and change TERMS_VERSION in src/config/legal.ts when the meaning changes.
 */
export default function PrivacyPage() {
  const h2 = "pt-4 font-display text-2xl font-bold text-ink-900";
  return (
    <DraftLegalPage title="Privacy">
      <p>
        This notice explains what personal data Perqly collects, why, who sees it and what you can do about it. Perqly is run by{" "}
        {OPERATOR_NAME}, who decides how this data is used. This is a draft (version {TERMS_VERSION}): it describes how the app works today,
        and is being reviewed together with Perqly&apos;s registration with Ghana&apos;s Data Protection Commission under the Data
        Protection Act, 2012 (Act 843).
      </p>

      <h2 className={h2}>What Perqly collects from students</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Your name, email address and, if you add it, your phone number.</li>
        <li>Your school, and if you give them, your school email, campus, programme, level and year of graduation.</li>
        <li>
          To verify you&apos;re a student: a photo of your student ID and a selfie, and your student ID number. The photos are deleted 30
          days after your verification is decided. After approval, Perqly keeps your student ID number only in scrambled form, so it can
          stop one student ID from being used on two accounts.
        </li>
        <li>The photo you add for your pass, which cashiers see when they confirm your discount.</li>
        <li>The discounts you use: where, when, what you bought and what you saved.</li>
        <li>Messages and photos you send to businesses, ratings you leave, and problems you report.</li>
        <li>If you turn them on, the details your phone needs to send you notifications.</li>
        <li>Which version of the terms and this notice you accepted when you signed up, and when.</li>
      </ul>

      <h2 className={h2}>Why Perqly uses it</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>To create and secure your account and sign you in.</li>
        <li>To check that you&apos;re a student before student prices unlock, and to stop one student ID being used on two accounts.</li>
        <li>To let you redeem discounts, and to give businesses and Perqly a record of discounts given.</li>
        <li>To send the messages and notifications you ask for, and to answer reports and support requests.</li>
        <li>To prevent fraud and misuse, and to keep a record of what staff do.</li>
      </ul>

      <h2 className={h2}>What Perqly collects from businesses</h2>
      <p>
        The business&apos;s details and branches, its catalogue and offers, the names and roles of the people who run it on Perqly, the
        agreement it accepted, and its redemptions and messages.
      </p>

      <h2 className={h2}>Who sees it</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          <strong>Perqly&apos;s verification reviewers</strong> (and reviewers your school appoints, if it does) see your verification
          details and photos, to check you&apos;re a student. Every time someone opens your ID photos, it&apos;s recorded.
        </li>
        <li>
          <strong>A business&apos;s cashier</strong> sees your pass photo, first name, school and the deal you picked when you redeem a
          discount there. Businesses you message see your name and your messages. A business sees your first name and initial on ratings you
          leave it.
        </li>
        <li>
          <strong>Perqly staff</strong> can see account and redemption details to run the service, handle problem reports and stop fraud.
          Their actions are recorded in an audit log.
        </li>
        <li>
          <strong>Anyone with a shared deal link</strong> sees that deal&apos;s shop, item, price and photo. Nothing about any student is
          shown.
        </li>
      </ul>

      <h2 className={h2}>Where it&apos;s kept and who helps run Perqly</h2>
      <p>
        Perqly&apos;s database and uploaded photos are stored with Supabase in London, United Kingdom, and the app runs on Vercel. These
        providers process data for Perqly and not for their own purposes. Perqly also uses:
      </p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Resend, to send sign-in codes and emails;</li>
        <li>Google, only if you choose to sign in with Google;</li>
        <li>your phone&apos;s notification service (from Google, Apple or your browser), only if you turn notifications on;</li>
        <li>OpenStreetMap, which supplies the map images and so sees your device&apos;s internet address when the map loads;</li>
        <li>Paystack, for businesses&apos; subscription payments. Students don&apos;t pay through Perqly.</li>
      </ul>

      <h2 className={h2}>How long it&apos;s kept</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Student ID photos and selfies: deleted 30 days after your verification is decided or withdrawn.</li>
        <li>Your student ID number: kept only in scrambled form after approval.</li>
        <li>
          Your account details: while your account is open. When it&apos;s deleted, your name and contact details are removed, and records
          of discounts used are kept without your name.
        </li>
      </ul>

      <h2 className={h2}>Your location</h2>
      <p>
        The map can use your phone&apos;s location to show shops near you. That happens on your phone: Perqly doesn&apos;t receive or store
        your location.
      </p>

      <h2 className={h2}>Analytics and cookies</h2>
      <p>
        To see which pages are used and how fast they load, Perqly uses Vercel Web Analytics and Speed Insights. They use no cookies, and
        Perqly removes search terms and record numbers from page addresses before anything is sent. Perqly uses a sign-in cookie to keep you
        signed in, and no tracking cookies.
      </p>

      <h2 className={h2}>Your choices</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          <strong>Download your data</strong> from Your account.
        </li>
        <li>
          <strong>Delete your account</strong> from Your account, or without the app as explained on{" "}
          <Link href="/delete-account" className="font-semibold text-blue-700 underline underline-offset-2">
            Delete your Perqly account
          </Link>
          . A person at Perqly carries it out within 30 days and emails you when it&apos;s done. Your name, contact details, chats, ratings
          and photos are removed. A record of discounts you used is kept without your name, because it&apos;s the business&apos;s and
          Perqly&apos;s record of discounts given.
        </li>
        <li>Turn notifications off at any time in your notification settings.</li>
        <li>
          Under the Data Protection Act, 2012 (Act 843), you can also ask Perqly what personal data it holds about you, ask for it to be
          corrected or deleted, and object to how it&apos;s used. Use the contact below.
        </li>
      </ul>

      <h2 className={h2}>Questions</h2>
      <p>
        For privacy questions or requests, email{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-semibold text-blue-700 underline underline-offset-2">
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
    </DraftLegalPage>
  );
}
