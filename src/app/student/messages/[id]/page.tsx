import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { getConversation } from "@/features/chat/queries";
import { ChatRoom } from "@/features/chat/room/chat-room";
import { RoomHeader } from "@/features/chat/room/room-header";
import { loadRoom } from "@/features/chat/room/server";
import { telUrl, whatsappUrl } from "@/features/merchants/shop";
import { getCoverPhotos } from "@/features/offers/queries";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function StudentChatPage({ params }: PageProps<"/student/messages/[id]">) {
  const { id } = await params;
  const [chat, ctx] = await Promise.all([getConversation(id), getUserContext()]);
  if (!chat || chat.side !== "student" || !ctx) notFound();
  const me = { kind: "shop", side: "student", userId: ctx.userId } as const;
  const [room, covers] = await Promise.all([loadRoom("shop", id, me), getCoverPhotos([chat.merchant_id])]);
  const iconLink = "grid size-11 place-items-center rounded-full text-blue-700 hover:bg-blue-50";
  return (
    <AreaShell area="student">
      <div className="max-w-2xl">
        <RoomHeader
          backHref="/student/messages"
          backLabel="All chats"
          name={chat.merchant_name}
          sub="Business · See shop"
          photo={covers.get(chat.merchant_id)}
          nameHref={`/student/merchants/${chat.merchant_slug}`}
        >
          {chat.merchant_phone && (
            <a href={telUrl(chat.merchant_phone)} className={iconLink} aria-label={`Call ${chat.merchant_name}`}>
              <Phone className="size-5" aria-hidden />
            </a>
          )}
          {chat.merchant_whatsapp && (
            <a
              href={whatsappUrl(chat.merchant_whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className={iconLink}
              aria-label={`WhatsApp ${chat.merchant_name}`}
            >
              <MessageCircle className="size-5" aria-hidden />
            </a>
          )}
        </RoomHeader>
        <ChatRoom
          kind="shop"
          chatId={id}
          me={me}
          otherName={chat.merchant_name}
          initialMessages={room.messages}
          initialReactions={room.reactions}
          initialOtherReadAt={chat.other_read_at ?? null}
          blocked={chat.blocked}
          blockedText="This business isn't taking messages from you."
          emptyText={`Ask ${chat.merchant_name} about a deal, opening times or anything else. Their owners and managers reply here.`}
        />
      </div>
    </AreaShell>
  );
}
