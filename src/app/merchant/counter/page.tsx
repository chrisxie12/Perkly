import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgeCheck, Check, QrCode, X } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { getActiveMembership, getMerchant } from "@/features/merchants/queries";
import { money } from "@/features/offers/schemas";
import { confirmAtCounter, rejectAtCounter } from "@/features/redemptions/actions";
import { AutoRefresh } from "@/features/redemptions/components/auto-refresh";
import { CodeKeypad } from "@/features/redemptions/components/code-keypad";
import { getCounterSessions, getCounterToday } from "@/features/redemptions/queries";
import { REJECT_REASONS, redemptionErrorMessage } from "@/features/redemptions/schemas";
import { MerchantAvatar } from "@/features/students/app/bits";
import { counterPhotos } from "@/features/pass-photo/server";

export const metadata: Metadata = { title: "Counter", robots: { index: false } };

const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" });

export default async function CounterPage({ searchParams }: PageProps<"/merchant/counter">) {
  const [membership, query] = await Promise.all([getActiveMembership(), searchParams]);
  if (!membership || membership.status !== "approved") redirect("/merchant");
  const [merchant, sessions, today] = await Promise.all([
    getMerchant(membership.merchantId),
    getCounterSessions(membership.merchantId),
    getCounterToday(membership.merchantId),
  ]);
  const waiting = sessions.filter((s) => s.status === "awaiting_merchant");
  const photos = waiting.length > 0 ? await counterPhotos(membership.merchantId) : new Map<string, string>();
  const confirmed = sessions.filter((s) => s.status !== "awaiting_merchant");
  const branches = [...new Set(sessions.map((s) => s.branch_name))];
  const error = typeof query.error === "string" ? query.error : undefined;
  const done =
    query.done === "confirmed"
      ? "Confirmed. The student confirms on their phone."
      : query.done === "declined"
        ? "Declined. The student sees your reason."
        : null;

  return (
    <AreaShell area="merchant">
      <AutoRefresh />
      <div className="-mx-4 -mt-6 sm:mx-0 sm:mt-0">
        <header className="flex flex-wrap items-center gap-3.5 border-b border-ink-200 bg-white px-4 py-4 sm:rounded-t-2xl">
          <MerchantAvatar name={merchant?.display_name ?? membership.displayName} category={null} />
          <div className="min-w-0 flex-1">
            <b className="block truncate text-[1.0625rem]">{merchant?.display_name ?? membership.displayName}</b>
            <span className="text-sm text-ink-600">
              {branches.length === 1 ? `${branches[0]} branch, counter screen` : "Counter screen"}
            </span>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800">
            <span className="live-dot !size-2" aria-hidden /> Live
          </span>
        </header>

        <div className="bg-[#F4F6FA] px-4 py-4">
          {(error || done) && (
            <p
              role={error ? "alert" : "status"}
              className={`mb-4 rounded-xl p-3 font-medium ring-1 ${error ? "bg-orange-50 ring-orange-200" : "bg-emerald-50 ring-emerald-200"}`}
            >
              {error ? redemptionErrorMessage(error) : done}
            </p>
          )}
          <h1 className="mb-3 flex items-center gap-2.5 font-display text-[1.375rem] font-bold">
            Waiting at the counter
            {waiting.length > 0 && (
              <span className="grid h-7 min-w-7 place-items-center rounded-full bg-blue-500 px-2 text-[0.9375rem] text-white">
                {waiting.length}
              </span>
            )}
          </h1>

          {waiting.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ink-300 bg-white px-5 py-8 text-center text-ink-600">
              <span className="grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <QrCode className="size-7" aria-hidden />
              </span>
              <b className="text-[1.0625rem] text-ink-900">No passes right now</b>
              <span>When a student scans your QR and picks what they bought, their pass appears here. This screen updates by itself.</span>
            </div>
          ) : (
            <ul className="space-y-3">
              {waiting.map((s) => (
                <li key={s.session_id}>
                  <article
                    aria-label={`Pass from ${s.student_first_name}`}
                    className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-200/70"
                  >
                    <div className="flex items-center gap-3.5">
                      {photos.get(s.session_id) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                        <img
                          src={photos.get(s.session_id)}
                          alt={`Photo of ${s.student_first_name ?? "the student"}`}
                          className="size-18 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          className="grid size-15 shrink-0 place-items-center rounded-full bg-ink-900 font-display text-2xl font-bold text-white"
                          aria-hidden
                        >
                          {(s.student_first_name ?? "?").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-[1.375rem] leading-tight font-bold">{s.student_first_name}</p>
                        <p className="flex items-center gap-1 text-sm font-semibold text-emerald-700">
                          <BadgeCheck className="size-4" aria-hidden /> Verified student, {s.institution}
                        </p>
                      </div>
                      <span className="self-start text-[0.8125rem] font-semibold whitespace-nowrap text-ink-600">
                        Until {time.format(new Date(s.expires_at))}
                      </span>
                    </div>
                    <div className="my-3.5 flex items-center justify-between gap-3 rounded-xl bg-ink-100 px-3.5 py-3">
                      <div className="min-w-0">
                        <b className="block text-[1.0625rem]">{s.item_name}</b>
                        <span className="text-[0.8125rem] text-ink-600">
                          {money(s.final_price)} instead of {money(s.regular_price)}. Check the code on their phone matches.
                        </span>
                      </div>
                      <div className="text-right">
                        <em className="block text-[0.6875rem] font-bold tracking-widest text-ink-600 not-italic">CODE</em>
                        <strong className="font-display text-3xl leading-none font-extrabold tracking-[0.1em] tabular-nums">
                          {s.pass_code}
                        </strong>
                      </div>
                    </div>
                    {!photos.get(s.session_id) && (
                      <p className="mb-3 text-sm text-ink-600">No photo on this pass. Ask to see their student ID.</p>
                    )}
                    {s.location_signal === "far" && (
                      <p className="mb-3 text-sm font-semibold text-orange-700">
                        Their phone reports it&apos;s far from this branch. Check they&apos;re here.
                      </p>
                    )}
                    <div className="group/act grid grid-cols-[1fr_2fr] gap-2.5">
                      <details className="group open:col-span-2">
                        <summary className="flex h-14 cursor-pointer list-none items-center justify-center gap-1.5 rounded-2xl border-2 border-red-200 bg-white text-[1.0625rem] font-bold text-red-700 group-open:hidden [&::-webkit-details-marker]:hidden">
                          <X className="size-5" aria-hidden /> Reject
                        </summary>
                        <form action={rejectAtCounter} className="space-y-2.5">
                          <input type="hidden" name="sessionId" value={s.session_id} />
                          <p className="font-bold">Why are you rejecting this pass?</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(REJECT_REASONS).map(([value, label]) => (
                              <label
                                key={value}
                                className="flex h-11 cursor-pointer items-center rounded-full border-[1.5px] border-ink-300 px-3.5 text-sm font-semibold has-[:checked]:border-red-600 has-[:checked]:bg-red-50 has-[:checked]:text-red-700"
                              >
                                <input type="radio" name="reason" value={value} required className="sr-only" /> {label}
                              </label>
                            ))}
                          </div>
                          <label htmlFor={`note-${s.session_id}`} className="block text-sm font-semibold">
                            Note (needed for &ldquo;Something else&rdquo;)
                          </label>
                          <input
                            id={`note-${s.session_id}`}
                            name="note"
                            maxLength={300}
                            className="h-11 w-full rounded-xl px-3 ring-1 ring-ink-300"
                          />
                          <SubmitButton className="w-full !bg-red-700">Reject pass</SubmitButton>
                        </form>
                      </details>
                      <form action={confirmAtCounter} className="group-has-[details[open]]/act:hidden">
                        <input type="hidden" name="sessionId" value={s.session_id} />
                        <input type="hidden" name="expectedFinalPrice" value={String(s.final_price)} />
                        <SubmitButton className="h-14 w-full rounded-2xl !bg-emerald-600 text-[1.0625rem] hover:!bg-emerald-700">
                          <Check aria-hidden /> Confirm
                        </SubmitButton>
                      </form>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}

          {confirmed.length > 0 && (
            <>
              <h2 className="mt-6 mb-2.5 text-xs font-bold tracking-wider text-ink-600">CONFIRMED, WAITING FOR THE STUDENT</h2>
              <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/70">
                {confirmed.map((s) => (
                  <li key={s.session_id} className="flex items-center gap-3 border-t border-ink-200 px-3.5 py-2.5 first:border-0">
                    <span className="min-w-0 flex-1">
                      <b className="font-semibold">{s.student_first_name ?? "A student"}</b>{" "}
                      <span className="text-sm text-ink-600">{s.item_name}</span>
                    </span>
                    <span className="text-[0.8125rem] font-bold text-orange-700">
                      {s.status === "expired" ? "Didn't finish" : "Confirming"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="mt-6 mb-2.5 text-xs font-bold tracking-wider text-ink-600">EARLIER TODAY</h2>
          {!today || today.recent.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-ink-600 ring-1 ring-ink-200/70">Nothing yet today.</p>
          ) : (
            <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/70">
              {today.recent.map((r) => (
                <li
                  key={r.session_id}
                  className="flex items-center gap-3 border-t border-ink-200 px-3.5 py-2.5 text-[0.9375rem] first:border-0"
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-700 text-[0.8125rem] font-bold text-white"
                    aria-hidden
                  >
                    {(r.first_name ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <b className="font-semibold">{r.first_name ?? "A student"}</b>{" "}
                    <span className="text-[0.8125rem] text-ink-600">{r.item}</span>
                  </span>
                  {r.outcome === "confirmed" ? (
                    <span className="flex items-center gap-1 text-[0.8125rem] font-bold whitespace-nowrap text-emerald-700">
                      <Check className="size-4" aria-hidden /> {time.format(new Date(r.at))}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[0.8125rem] font-bold whitespace-nowrap text-red-700">
                      <X className="size-4" aria-hidden />{" "}
                      {r.reason ? (REJECT_REASONS[r.reason as keyof typeof REJECT_REASONS] ?? "Declined") : "Declined"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="sticky bottom-16 flex flex-wrap items-center gap-3 border-t border-ink-200 bg-white px-4 py-3 sm:rounded-b-2xl md:bottom-0">
          <dl className="flex flex-1 basis-full justify-between gap-4 sm:basis-auto sm:justify-start sm:gap-6">
            {[
              [String(today?.students ?? 0), "Students today"],
              [String(today?.returning ?? 0), "Came back"],
              [money(today?.discount_given ?? 0), "Discount given"],
            ].map(([v, l]) => (
              <div key={l}>
                <dd className="font-display text-xl leading-tight font-bold tabular-nums">{v}</dd>
                <dt className="text-xs font-semibold whitespace-nowrap text-ink-600">{l}</dt>
              </div>
            ))}
          </dl>
          <div className="w-full sm:w-auto [&>button]:w-full">
            <CodeKeypad merchantId={membership.merchantId} />
          </div>
        </footer>
      </div>
    </AreaShell>
  );
}
