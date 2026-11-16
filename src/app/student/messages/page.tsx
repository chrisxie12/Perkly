import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { listMyConversations } from "@/features/chat/queries";
import { getCoverPhotos } from "@/features/offers/queries";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default async function StudentMessagesPage() {
  const chats = await listMyConversations();
  const covers = await getCoverPhotos(chats.flatMap((c) => (c.merchant_id ? [c.merchant_id] : [])));
  const photos = new Map<string, string>();
  for (const c of chats) {
    const url = c.merchant_id ? covers.get(c.merchant_id) : undefined;
    if (url) photos.set(c.id, url);
  }
  return (
    <AreaShell area="student">
      <h1 className="mb-3 font-display text-xl font-bold">Messages</h1>
      {chats.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className="mb-2 grid size-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <MessageCircle className="size-7" aria-hidden />
          </span>
          <h2 className="font-display text-xl font-bold">No messages yet</h2>
          <p className="mt-1 max-w-[32ch] text-[0.9375rem] text-ink-600">Ask a business about a deal: open its shop page and tap Chat.</p>
          <Link href="/student" className={`${buttonVariants({ size: "sm" })} mt-4`}>
            Browse deals
          </Link>
        </div>
      ) : (
        <ConversationList items={chats} me="student" photos={photos} />
      )}
    </AreaShell>
  );
}
