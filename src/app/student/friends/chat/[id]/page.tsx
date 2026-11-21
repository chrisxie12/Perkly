import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flag } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { ChatRoom } from "@/features/chat/room/chat-room";
import { RoomHeader } from "@/features/chat/room/room-header";
import { loadRoom } from "@/features/chat/room/server";
import { getFriendChat } from "@/features/friends/queries";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function FriendChatPage({ params }: PageProps<"/student/friends/chat/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [chat, ctx] = await Promise.all([getFriendChat(id), getUserContext()]);
  if (!chat || !ctx) notFound();
  const me = { kind: "friend", userId: ctx.userId } as const;
  const room = await loadRoom("friend", id, me);
  return (
    <AreaShell area="student">
      <div className="max-w-2xl">
        <RoomHeader backHref="/student/messages" backLabel="All chats" name={chat.friend_name} sub="Friend" friend>
          <Link
            href={`/student/friends/report/${chat.friend_id}?chat=${chat.id}`}
            className="grid size-11 place-items-center rounded-full text-ink-600 hover:bg-ink-100"
            aria-label={`Report ${chat.friend_name}`}
          >
            <Flag className="size-5" aria-hidden />
          </Link>
        </RoomHeader>
        <ChatRoom
          kind="friend"
          chatId={id}
          me={me}
          otherName={chat.friend_name}
          initialMessages={room.messages}
          initialReactions={room.reactions}
          initialOtherReadAt={chat.other_read_at ?? null}
          blocked={!chat.can_send}
          blockedText="You can only message friends. This chat is closed."
          emptyText={`Say hi to ${chat.friend_name}. Only the two of you can see this chat.`}
        />
      </div>
    </AreaShell>
  );
}
