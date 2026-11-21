import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MessageCircle, UserPlus, Users } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { InboxList } from "@/features/chat/components/inbox-list";
import { loadInbox } from "@/features/chat/inbox";
import { countFriendRequests } from "@/features/friends/queries";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";

export const metadata: Metadata = { title: "Chats", robots: { index: false } };

export default async function StudentMessagesPage() {
  const status = await getMyStudentStatus();
  const verified = verificationView(status) === "verified";
  const [items, requests] = await Promise.all([loadInbox(verified), verified ? countFriendRequests() : Promise.resolve(0)]);

  return (
    <AreaShell area="student">
      <div className="max-w-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold">Chats</h1>
          {verified && (
            <Link
              href="/student/friends"
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              <UserPlus className="size-4" aria-hidden />
              Find friends
            </Link>
          )}
        </div>

        {requests > 0 && (
          <Link href="/student/friends" className="glass mb-3 flex items-center gap-3 rounded-3xl px-4 py-3">
            <span aria-hidden className="grid size-10 place-items-center rounded-full bg-orange-100 text-orange-700">
              <Users className="size-5" />
            </span>
            <span className="min-w-0 flex-1 font-semibold text-ink-900">
              {requests === 1 ? "1 friend request" : `${requests} friend requests`}
            </span>
            <ChevronRight className="size-5 text-ink-600" aria-hidden />
          </Link>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="mb-2 grid size-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <MessageCircle className="size-7" aria-hidden />
            </span>
            <h2 className="font-display text-xl font-bold">No chats yet</h2>
            <p className="mt-1 max-w-[34ch] text-[0.9375rem] text-ink-600">
              {verified
                ? "Message a friend from your school, or ask a business about a deal from its shop page."
                : "Ask a business about a deal: open its shop page and tap Chat."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {verified && (
                <Link href="/student/friends" className={buttonVariants({ size: "sm" })}>
                  Find friends
                </Link>
              )}
              <Link href="/student" className={buttonVariants({ size: "sm", variant: verified ? "secondary" : "primary" })}>
                Browse deals
              </Link>
            </div>
          </div>
        ) : (
          <InboxList items={items} showFriends={verified} />
        )}
      </div>
    </AreaShell>
  );
}
