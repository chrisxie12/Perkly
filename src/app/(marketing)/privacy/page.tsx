import type { Metadata } from "next";
import { DraftLegalPage } from "@/components/layout/draft-legal-page";

export const metadata: Metadata = { title: "Privacy", robots: { index: false } };

/**
 * An honest interim notice: what the app collects today, as built. It is not the full privacy
 * policy, which is being prepared with Data Protection Commission registration. Every statement
 * here must match the code; change both together.
 */
export default function PrivacyPage() {
  const h2 = "pt-4 font-display text-2xl font-bold text-ink-900";
  return (
    <DraftLegalPage title="Privacy">
      <p>
        This notice explains what Perqly collects today and why. Perqly&apos;s full privacy policy is being prepared, together with
        registration with Ghana&apos;s Data Protection Commission under the Data Protection Act, 2012 (Act 843). Until then, this notice is
        a plain description of how the app works, not a final policy.
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
      </ul>

      <h2 className={h2}>What Perqly collects from businesses</h2>
      <p>
        The business&apos;s details and branches, its catalogue and offers, the names and roles of the people who run it on Perqly, the
        agreement it accepted, and its redemptions and messages.
      </p>

      <h2 className={h2}>Who sees it</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          <strong>Your school&apos;s appointed reviewers</strong> see your verification details and photos, to check you&apos;re a student.
          Every time someone opens your ID photos, it&apos;s recorded.
        </li>
        <li>
          <strong>A business&apos;s cashier</strong> sees your pass photo and first name when you redeem a discount there. Businesses you
          message see your name and your messages.
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
          <strong>Delete your account</strong> from Your account. A person at Perqly carries it out. Your name and contact details are
          removed. A record of discounts you used is kept without your name, because it&apos;s the business&apos;s and Perqly&apos;s record
          of discounts given.
        </li>
        <li>Turn notifications off at any time in your notification settings.</li>
      </ul>

      <h2 className={h2}>Questions</h2>
      <p>A contact for privacy questions will be added here before Perqly opens to students.</p>
    </DraftLegalPage>
  );
}
