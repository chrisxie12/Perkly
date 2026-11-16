import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MessageCircle, Phone } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { ChatThread } from "@/features/chat/components/chat-thread";
import { getConversation, getMessages } from "@/features/chat/queries";
import { telUrl, whatsappUrl } from "@/features/merchants/shop";
import { getCoverPhotos } from "@/features/offers/queries";
import { MerchantAvatar } from "@/features/students/app/bits";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function StudentChatPage({ params }: PageProps<"/student/messages/[id]">) {
  const { id } = await params;
  const chat = await getConversation(id);
  if (!chat || chat.side !== "student") notFound();
  const [messages, covers] = await Promise.all([getMessages(id), getCoverPhotos([chat.merchant_id])]);
  const iconLink = "grid size-11 place-items-center rounded-full text-blue-700 hover:bg-blue-50";
  return (
    <AreaShell area="student" immersive>
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col bg-paper px-4">
        <header className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-2 border-b border-ink-200 bg-paper px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
          <Link
            href="/student/messages"
            className="grid size-11 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
            aria-label="All messages"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
          <Link href={`/student/merchants/${chat.merchant_slug}`} className="flex min-w-0 flex-1 items-center gap-2.5">
            <MerchantAvatar
              name={chat.merchant_name}
              category={null}
              size="sm"
              className="rounded-full"
              photo={covers.get(chat.merchant_id)}
            />
            <span className="min-w-0">
              <span className="block truncate font-bold text-ink-900">{chat.merchant_name}</span>
              <span className="block text-xs text-ink-600">See shop</span>
            </span>
          </Link>
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
        </header>
        <ChatThread
          conversationId={id}
          me="student"
          initialMessages={messages}
          blocked={chat.blocked}
          blockedText="This business isn't taking messages from you."
          emptyText={`Ask ${chat.merchant_name} about a deal, opening times or anything else. Their owners and managers reply here.`}
        />
      </div>
    </AreaShell>
  );
}
