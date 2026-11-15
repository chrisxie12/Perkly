import { BadgeCheck, Camera, Clock3, IdCard, Mail, ShieldCheck } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";

const evidence = [
  { icon: IdCard, title: "Student ID number", body: "Checked against your student ID card." },
  { icon: Camera, title: "ID photo and a selfie", body: "So the reviewer can see the person on the ID is you." },
  {
    icon: Mail,
    title: "School email, if you have one",
    body: "Optional. You sign up with your personal email, and you can add a school email to your application.",
  },
];

export function Verification() {
  return (
    <section id="verification" aria-labelledby="verification-title" className="bg-white py-14 sm:py-20 md:py-32">
      <PageContainer className="grid grid-cols-1 items-center gap-8 sm:gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <h2 id="verification-title" className="font-display text-display-lg font-extrabold">
            Real students only. We check.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
            Perqly&apos;s verification team checks every request by hand: your student ID card, your ID number and a selfie. Perqly collects
            the details they need and keeps a record of every decision.
          </p>
          <ul className="mt-10 space-y-6">
            {evidence.map(({ icon: Icon, title, body }) => (
              <li key={title} className="reveal flex gap-4">
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
                  <BadgeCheck className="size-5 text-success" aria-hidden /> Signed up with a personal email
                </li>
                <li className="flex items-center gap-3">
                  <BadgeCheck className="size-5 text-success" aria-hidden /> Student ID number added
                </li>
                <li className="flex items-center gap-3">
                  <BadgeCheck className="size-5 text-success" aria-hidden /> ID photo and selfie uploaded
                </li>
                <li className="flex items-center gap-3 rounded-lg bg-orange-50 px-3 py-2.5 text-ink-900">
                  <Clock3 className="size-5 text-orange-700" aria-hidden /> Waiting for review
                </li>
              </ol>
            </div>
          </div>

          <div className="mt-5 flex gap-4 rounded-2xl bg-blue-50 p-5 text-blue-900 ring-1 ring-blue-100">
            <ShieldCheck className="size-6 shrink-0 text-blue-600" aria-hidden />
            <p className="text-[0.9375rem] leading-relaxed">
              Only the people reviewing your request see your ID photo, and every view is logged. ID photos are deleted 30 days after a
              decision. Merchants never see your phone number or email.
            </p>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
