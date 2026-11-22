import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { listMerchantConversations } from "@/features/chat/queries";
import { getMyChatPrefs } from "@/features/chat/room/server";
import { getActiveMembership } from "@/features/merchants/queries";
import { canManage } from "../merchant-nav";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default async function MerchantMessagesPage({ searchParams }: PageProps<"/merchant/messages">) {
  const membership = await getActiveMembership();
  if (!membership || !canManage(membership)) redirect("/merchant");
  const showArchived = (await searchParams).archived === "1";
  const [all, prefs] = await Promise.all([listMerchantConversations(membership.merchantId), getMyChatPrefs()]);
  // An archived chat comes back to the list when a new message arrives.
  const archivedAt = new Map(prefs.filter((p) => p.kind === "shop" && p.archived_at).map((p) => [p.chat_id, p.archived_at!]));
  const isArchived = (c: (typeof all)[number]) =>
    archivedAt.has(c.id) && new Date(c.last_message_at).getTime() <= new Date(archivedAt.get(c.id)!).getTime();
  const archivedCount = all.filter(isArchived).length;
  const chats = all.filter((c) => isArchived(c) === showArchived);
  return (
    <AreaShell area="merchant">
      <PageTitle
        title={showArchived ? "Archived messages" : "Messages"}
        description="Students' questions to your business. Owners and managers can reply."
      />
      {(archivedCount > 0 || showArchived) && (
        <p className="mb-4">
          <Link
            href={showArchived ? "/merchant/messages" : "/merchant/messages?archived=1"}
            className="text-sm font-semibold text-blue-700"
          >
            {showArchived ? "Back to messages" : `Archived (${archivedCount})`}
          </Link>
        </p>
      )}
      {chats.length === 0 ? (
        <div className="flex max-w-xl flex-col items-center rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-ink-200/70">
          <span className="mb-2 grid size-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <MessageCircle className="size-7" aria-hidden />
          </span>
          <h2 className="font-display text-xl font-bold">{showArchived ? "No archived messages" : "No messages yet"}</h2>
          <p className="mt-1 max-w-[36ch] text-[0.9375rem] text-ink-600">
            Students can message you from your shop page. You&apos;ll get a notification when they do.
          </p>
        </div>
      ) : (
        <div className="max-w-2xl">
          <ConversationList items={chats} me="merchant" />
        </div>
      )}
    </AreaShell>
  );
}
