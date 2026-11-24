import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AreaShell } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { ChatRoom } from "@/features/chat/room/chat-room";
import { RoomHeader } from "@/features/chat/room/room-header";
import { getChatPref, loadRoom } from "@/features/chat/room/server";
import { ChatMenu } from "@/features/chat/room/chat-menu";
import { getFriendChat } from "@/features/friends/queries";
import { draftFrom } from "@/features/share/model";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function FriendChatPage({ params, searchParams }: PageProps<"/student/friends/chat/[id]">) {
  const { id } = await params;
  const draft = draftFrom((await searchParams).draft);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [chat, ctx] = await Promise.all([getFriendChat(id), getUserContext()]);
  if (!chat || !ctx) notFound();
  const me = { kind: "friend", userId: ctx.userId } as const;
  const [room, pref] = await Promise.all([loadRoom("friend", id, me), getChatPref("friend", id)]);
  return (
    <AreaShell area="student">
      <div className="max-w-2xl">
        <RoomHeader backHref="/student/messages" backLabel="All chats" name={chat.friend_name} sub="Friend" friend chatId={id}>
          <ChatMenu
            kind="friend"
            chatId={id}
            muted={pref.muted}
            archived={pref.archived}
            inboxHref="/student/messages"
            reportHref={`/student/friends/report/${chat.friend_id}?chat=${chat.id}`}
          />
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
          initialDraft={draft}
          initialDisappear={chat.disappear ?? "24h"}
          disappearSetBy={chat.disappear_set_by_me == null ? null : chat.disappear_set_by_me ? "me" : "friend"}
        />
      </div>
    </AreaShell>
  );
}
