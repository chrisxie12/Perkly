import "server-only";
import { listMyConversations } from "./queries";
import { listFriendChats } from "@/features/friends/queries";
import { getCoverPhotos } from "@/features/offers/queries";
import { applyPrefs, mergeInbox, type InboxItem } from "./inbox-model";
import { getMyChatPrefs } from "./room/server";

export type { InboxItem };

/** Friend chats and business chats in one list, newest first. Friend chats only for verified students. */
export async function loadInbox(includeFriends: boolean): Promise<InboxItem[]> {
  const [shops, friends, prefs] = await Promise.all([
    listMyConversations(),
    includeFriends ? listFriendChats() : Promise.resolve([]),
    getMyChatPrefs(),
  ]);
  const covers = await getCoverPhotos(shops.flatMap((c) => (c.merchant_id ? [c.merchant_id] : [])));
  const merged = mergeInbox(
    shops.map((c) => ({
      key: `shop:${c.id}`,
      kind: "shop" as const,
      title: c.title,
      href: c.href,
      photo: (c.merchant_id && covers.get(c.merchant_id)) || null,
      preview: c.last_message_preview,
      fromMe: c.last_sender === "student",
      at: c.last_message_at,
      unread: c.unread,
      closed: c.blocked,
    })),
    friends.map((c) => ({
      key: `friend:${c.id}`,
      kind: "friend" as const,
      title: c.friend_name,
      href: `/student/friends/chat/${c.id}`,
      photo: null,
      // Every message in the chat has disappeared.
      preview: c.last_message_preview ?? "Messages disappeared",
      fromMe: c.last_message_preview !== null && c.last_from_me,
      at: c.last_message_at,
      unread: c.unread,
      closed: !c.can_send,
    })),
  );
  return applyPrefs(merged, prefs);
}
