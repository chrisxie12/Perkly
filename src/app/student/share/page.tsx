import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ExternalLink, MessageCircle, Users } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { loadInbox } from "@/features/chat/inbox";
import { getFeatureSwitches } from "@/features/platform/switches";
import { perqlyPath, sharedMessage } from "@/features/share/model";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { initials } from "@/features/students/app/format";
import { getSiteUrl } from "@/lib/env";

export const metadata: Metadata = { title: "Share to Perqly", robots: { index: false } };

/**
 * Where "Share to Perqly" lands, from the phone's share menu (the Android app and the
 * installed web app both send title, text and url here). Pick a chat and the shared
 * text waits in its message box: nothing is sent until the student taps Send.
 */
export default async function SharePage({ searchParams }: PageProps<"/student/share">) {
  const params = await searchParams;
  const shared = sharedMessage({ title: params.title, text: params.text, url: params.url });
  const open = shared ? perqlyPath(shared, getSiteUrl()) : null;

  const [status, switches] = await Promise.all([getMyStudentStatus(), getFeatureSwitches()]);
  const friends = verificationView(status) === "verified" && switches.friends;
  const chats = shared ? (await loadInbox(friends)).filter((c) => !c.closed && !c.archived).slice(0, 30) : [];

  return (
    <AreaShell area="student">
      <div className="max-w-2xl">
        <h1 className="font-display text-2xl font-bold">Share to Perqly</h1>

        {!shared ? (
          <div className="mt-6 text-center">
            <p className="text-ink-700">Nothing came through to share. Try sharing again from the other app.</p>
            <Link href="/student" className={buttonVariants({ size: "sm", className: "mt-4" })}>
              Browse deals
            </Link>
          </div>
        ) : (
          <>
            <figure className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-ink-200/70">
              <figcaption className="text-sm font-semibold text-ink-600">What you&apos;re sharing</figcaption>
              <p className="mt-1 line-clamp-6 text-[0.9375rem] break-words whitespace-pre-line text-ink-900">{shared}</p>
            </figure>

            {open && (
              <Link
                href={open}
                className="press mt-3 flex min-h-12 items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3 font-semibold text-blue-800"
              >
                <ExternalLink className="size-5" aria-hidden />
                <span className="flex-1">Open it in Perqly</span>
                <ChevronRight className="size-5" aria-hidden />
              </Link>
            )}

            <h2 className="mt-6 mb-2 font-display text-lg font-bold">Send it in a chat</h2>
            {chats.length === 0 ? (
              <p className="text-ink-700">You don&apos;t have any open chats yet. Open a shop and tap Chat, then share again.</p>
            ) : (
              <ul className="divide-y divide-ink-200 rounded-3xl bg-white ring-1 ring-ink-200/70">
                {chats.map((c) => (
                  <li key={c.key}>
                    <Link
                      href={`${c.href}?draft=${encodeURIComponent(shared)}`}
                      className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-ink-50"
                    >
                      {c.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- public storage URL
                        <img src={c.photo} alt="" className="size-11 rounded-full object-cover" />
                      ) : (
                        <span aria-hidden className="grid size-11 place-items-center rounded-full bg-blue-50 font-bold text-blue-700">
                          {c.kind === "friend" ? <Users className="size-5" /> : initials(c.title)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink-900">{c.title}</span>
                        <span className="block text-sm text-ink-600">{c.kind === "friend" ? "Friend" : "Business"}</span>
                      </span>
                      <MessageCircle className="size-5 text-ink-600" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-ink-600">Nothing is sent until you tap Send in the chat.</p>
          </>
        )}
      </div>
    </AreaShell>
  );
}
