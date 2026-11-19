import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Flag } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { initials } from "@/features/students/app/bits";
import { FriendChatThread } from "@/features/friends/components/friend-chat-thread";
import { getFriendChat, getFriendMessages } from "@/features/friends/queries";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function FriendChatPage({ params }: PageProps<"/student/friends/chat/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [chat, ctx] = await Promise.all([getFriendChat(id), getUserContext()]);
  if (!chat || !ctx) notFound();
  const messages = await getFriendMessages(id);
  return (
    <AreaShell area="student">
      <div className="max-w-2xl">
        <header className="sticky top-16 z-10 -mx-4 -mt-6 mb-2 flex items-center gap-2 border-b border-ink-200 bg-paper px-2 py-2 sm:mx-0 md:-mt-12">
          <Link
            href="/student/friends"
            className="grid size-11 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
            aria-label="All friends"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
          <span aria-hidden className="grid size-9 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
            {initials(chat.friend_name)}
          </span>
          <span className="min-w-0 flex-1 truncate font-bold text-ink-900">{chat.friend_name}</span>
          <Link
            href={`/student/friends/report/${chat.friend_id}?chat=${chat.id}`}
            className="grid size-11 place-items-center rounded-full text-ink-600 hover:bg-ink-100"
            aria-label={`Report ${chat.friend_name}`}
          >
            <Flag className="size-5" aria-hidden />
          </Link>
        </header>
        <FriendChatThread
          chatId={id}
          me={ctx.userId}
          initialMessages={messages}
          blocked={!chat.can_send}
          blockedText="You can only message friends. This chat is closed."
          emptyText={`Say hi to ${chat.friend_name}. Only the two of you can see this chat.`}
        />
      </div>
    </AreaShell>
  );
}
