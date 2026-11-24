import * as React from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LiveBell } from "@/components/auth/live-bell";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { countUnreadChats } from "@/features/chat/queries";
import { countFriendRequests, countUnreadFriendChats } from "@/features/friends/queries";
import { getFeatureSwitches } from "@/features/platform/switches";
import { Logo } from "@/components/shared/logo";
import { MeContent } from "@/features/students/app/me-content";
import { ProfileDrawer } from "./profile-drawer";

const NEEDS_ACTION = ["needs_profile", "apply", "resubmit", "rejected", "expired"];

/**
 * The students' top bar: the Perqly logo at the top left opens your profile and
 * settings (the same panel as swiping right on Home), and Notifications and Chat
 * sit on the right. The bottom bar is for places.
 */
export async function StudentTopBar() {
  const ctx = await getUserContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const [status, unreadChats, unreadFriendChats, friendRequests, unreadRes, switches] = await Promise.all([
    getMyStudentStatus(),
    countUnreadChats(),
    countUnreadFriendChats(),
    countFriendRequests(),
    supabase.rpc("unread_notification_count"),
    getFeatureSwitches(),
  ]);
  const view = verificationView(status);
  const verified = view === "verified";
  const needsAction = view !== null && NEEDS_ACTION.includes(view);
  const chatCount = unreadChats + (verified && switches.friends ? unreadFriendChats + friendRequests : 0);
  const unread = typeof unreadRes.data === "number" ? unreadRes.data : 0;

  return (
    <div className="flex h-16 items-center justify-between gap-2 px-3 md:px-5">
      <ProfileDrawer
        triggerLabel={needsAction ? "Your profile and settings, needs attention" : "Your profile and settings"}
        trigger={
          <>
            <Logo />
            {needsAction && <span className="absolute -top-0.5 left-7 size-3 rounded-full bg-orange-500 ring-2 ring-paper" aria-hidden />}
          </>
        }
      >
        <MeContent />
      </ProfileDrawer>
      <div className="flex items-center gap-2">
        <LiveBell userId={ctx.userId} initialUnread={unread} round />
        <Link
          href="/student/messages"
          aria-label={chatCount > 0 ? `Chat, ${chatCount} new` : "Chat"}
          className="press glass grid size-11 place-items-center rounded-full text-ink-900"
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
        </Link>
      </div>
    </div>
  );
}
