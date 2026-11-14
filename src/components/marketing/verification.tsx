import { BadgeCheck, Camera, Clock3, IdCard, Mail, ShieldCheck } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";

const evidence = [
  { icon: Mail, title: "School email", body: "We send a 6-digit code to your school email address to confirm it's yours." },
  { icon: IdCard, title: "Student ID number", body: "Your school's reviewers check it against their records." },
  { icon: Camera, title: "ID photo and a selfie", body: "So the reviewer can see the person on the ID is you." },
];

export function Verification() {
  return (
    <section id="verification" aria-labelledby="verification-title" className="bg-white py-24 md:py-32">
      <PageContainer className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <h2 id="verification-title" className="font-display text-display-lg font-extrabold">
            Your school says you&apos;re a student. Not us.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
            Reviewers appointed by your institution approve every verification request. Perkly collects the details they need and keeps a
            record of every decision.
          </p>
          <ul className="mt-10 space-y-6">
            {evidence.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon className="size-6" aria-hidden />
                </span>
                <span>
                  <span className="block font-display text-lg font-bold">{title}</span>
                  <span className="mt-1 block text-ink-600">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="rounded-2xl bg-ink-100 p-5 sm:p-8">
            <div className="rounded-xl bg-white p-6 shadow-lift ring-1 ring-ink-200" aria-label="Example verification request" role="img">
              <div className="flex items-center justify-between">
                <p className="font-display text-lg font-bold">Verification request</p>
                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">Example</span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-ink-600">Institution</dt>
                  <dd className="mt-0.5 font-semibold">GCTU</dd>
                </div>
                <div>
                  <dt className="text-ink-600">Programme</dt>
                  <dd className="mt-0.5 font-semibold">BSc Computer Science</dd>
                </div>
              </dl>
              <ol className="mt-6 space-y-3 border-t border-ink-200 pt-5 text-[0.9375rem] font-medium">
                <li className="flex items-center gap-3">
                  <BadgeCheck className="size-5 text-success" aria-hidden /> School email confirmed
                </li>
                <li className="flex items-center gap-3">
                  <BadgeCheck className="size-5 text-success" aria-hidden /> Student ID number added
                </li>
                <li className="flex items-center gap-3">
                  <BadgeCheck className="size-5 text-success" aria-hidden /> ID photo and selfie uploaded
                </li>
                <li className="flex items-center gap-3 rounded-lg bg-orange-50 px-3 py-2.5 text-ink-900">
                  <Clock3 className="size-5 text-orange-700" aria-hidden /> Waiting for GCTU&apos;s reviewers
                </li>
              </ol>
            </div>
          </div>

          <div className="mt-5 flex gap-4 rounded-2xl bg-blue-50 p-5 text-blue-900 ring-1 ring-blue-100">
            <ShieldCheck className="size-6 shrink-0 text-blue-600" aria-hidden />
            <p className="text-[0.9375rem] leading-relaxed">
              Only your school&apos;s reviewers see your ID photo, and every view is logged. ID photos are deleted 30 days after a decision.
              Merchants never see your phone number or email.
            </p>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
