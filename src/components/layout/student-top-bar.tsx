import * as React from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LiveBell } from "@/components/auth/live-bell";
import { getMyPassPhotoPath, signPassPhoto } from "@/features/pass-photo/server";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { countUnreadChats } from "@/features/chat/queries";
import { countFriendRequests, countUnreadFriendChats } from "@/features/friends/queries";

const NEEDS_ACTION = ["needs_profile", "apply", "resubmit", "rejected", "expired"];

/**
 * The students' top bar, Snapchat style: your photo at the top left opens Me,
 * and Notifications and Chat sit on the right. The bottom bar is for places.
 */
export async function StudentTopBar() {
  const ctx = await getUserContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const [status, photoPath, unreadChats, unreadFriendChats, friendRequests, unreadRes] = await Promise.all([
    getMyStudentStatus(),
    getMyPassPhotoPath(),
    countUnreadChats(),
    countUnreadFriendChats(),
    countFriendRequests(),
    supabase.rpc("unread_notification_count"),
  ]);
  // Long enough that the photo stays put while you move between tabs.
  const photoUrl = await signPassPhoto(photoPath, 3600);
  const view = verificationView(status);
  const verified = view === "verified";
  const needsAction = view !== null && NEEDS_ACTION.includes(view);
  const name = ctx.fullName ?? ctx.firstName ?? "Me";
  const chatCount = unreadChats + (verified ? unreadFriendChats + friendRequests : 0);
  const unread = typeof unreadRes.data === "number" ? unreadRes.data : 0;

  return (
    <div className="flex h-16 items-center justify-between gap-2 px-3 md:px-5">
      <Link
        href="/student/me"
        aria-label={needsAction ? "Me, needs attention" : "Me"}
        className="press relative shrink-0 rounded-full shadow-soft ring-2 ring-white/80"
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={photoUrl} alt="" className="size-11 rounded-full object-cover" />
        ) : (
          <span
            className="grid size-11 place-items-center rounded-full bg-blue-50 font-display text-lg font-bold text-blue-700"
            aria-hidden
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        {needsAction && <span className="absolute top-0 right-0 size-3 rounded-full bg-orange-500 ring-2 ring-white" aria-hidden />}
      </Link>
      <div className="flex items-center gap-1">
        <LiveBell userId={ctx.userId} initialUnread={unread} labelled />
        <Link
          href="/student/messages"
          aria-label={chatCount > 0 ? `Chat, ${chatCount} new` : "Chat"}
          className="press flex flex-col items-center gap-0.5 rounded-2xl px-2 py-1 text-[0.6875rem] font-medium text-ink-700"
        >
          <span className="relative grid size-7 place-items-center">
            <MessageCircle className="size-[1.375rem]" aria-hidden />
            {chatCount > 0 && (
              <span
                className="absolute -top-1 -right-1.5 grid min-w-4 place-items-center rounded-full bg-orange-500 px-1 text-[0.6875rem] leading-4 font-bold text-white"
                aria-hidden
              >
                {chatCount > 9 ? "9+" : chatCount}
              </span>
            )}
          </span>
          <span aria-hidden>Chat</span>
        </Link>
      </div>
    </div>
  );
}
