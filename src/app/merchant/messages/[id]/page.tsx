import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { setConversationBlocked } from "@/features/chat/actions";
import { getConversation } from "@/features/chat/queries";
import { ChatRoom } from "@/features/chat/room/chat-room";
import { RoomHeader } from "@/features/chat/room/room-header";
import { getChatPref, loadRoom } from "@/features/chat/room/server";
import { ChatMenu } from "@/features/chat/room/chat-menu";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function MerchantChatPage({ params }: PageProps<"/merchant/messages/[id]">) {
  const { id } = await params;
  const [chat, ctx] = await Promise.all([getConversation(id), getUserContext()]);
  if (!chat || chat.side !== "merchant" || !ctx) notFound();
  const me = { kind: "shop", side: "merchant", userId: ctx.userId } as const;
  const [room, pref] = await Promise.all([loadRoom("shop", id, me), getChatPref("shop", id)]);
  const name = chat.student_name ?? "Student";
  return (
    <AreaShell area="merchant">
      <div className="max-w-2xl">
        <RoomHeader backHref="/merchant/messages" backLabel="All messages" name={name} sub="Student" chatId={id}>
          <form action={setConversationBlocked}>
            <input type="hidden" name="conversationId" value={id} />
            <input type="hidden" name="blocked" value={chat.blocked ? "false" : "true"} />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-700 hover:bg-ink-100"
            >
              <Ban className="size-4" aria-hidden />
              {chat.blocked ? "Unblock" : "Block"}
            </button>
          </form>
          <ChatMenu kind="shop" chatId={id} muted={pref.muted} archived={pref.archived} inboxHref="/merchant/messages" />
        </RoomHeader>
        {chat.blocked && (
          <p className="mb-2 rounded-xl bg-ink-50 px-4 py-2.5 text-center text-sm text-ink-600">
            You&apos;ve blocked {name}. They can&apos;t send you messages until you unblock them.
          </p>
        )}
        <ChatRoom
          kind="shop"
          chatId={id}
          me={me}
          otherName={name}
          initialMessages={room.messages}
          initialReactions={room.reactions}
          initialOtherReadAt={chat.other_read_at ?? null}
          blocked={Boolean(chat.blocked_by_student)}
          blockedText={`${name} has blocked your business, so you can't send messages.`}
          emptyText="No messages yet."
        />
      </div>
    </AreaShell>
  );
}
