import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { listMerchantConversations } from "@/features/chat/queries";
import { getActiveMembership } from "@/features/merchants/queries";
import { canManage } from "../merchant-nav";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default async function MerchantMessagesPage() {
  const membership = await getActiveMembership();
  if (!membership || !canManage(membership)) redirect("/merchant");
  const chats = await listMerchantConversations(membership.merchantId);
  return (
    <AreaShell area="merchant">
      <PageTitle title="Messages" description="Students' questions to your business. Owners and managers can reply." />
      {chats.length === 0 ? (
        <div className="flex max-w-xl flex-col items-center rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-ink-200/70">
          <span className="mb-2 grid size-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <MessageCircle className="size-7" aria-hidden />
          </span>
          <h2 className="font-display text-xl font-bold">No messages yet</h2>
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
