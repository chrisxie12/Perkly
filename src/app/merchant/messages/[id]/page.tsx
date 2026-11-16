import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, ChevronLeft } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { setConversationBlocked } from "@/features/chat/actions";
import { ChatThread } from "@/features/chat/components/chat-thread";
import { getConversation, getMessages } from "@/features/chat/queries";
import { initials } from "@/features/students/app/format";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function MerchantChatPage({ params }: PageProps<"/merchant/messages/[id]">) {
  const { id } = await params;
  const chat = await getConversation(id);
  if (!chat || chat.side !== "merchant") notFound();
  const messages = await getMessages(id);
  const name = chat.student_name ?? "Student";
  return (
    <AreaShell area="merchant" immersive>
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col bg-paper px-4">
        <header className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-2 border-b border-ink-200 bg-paper px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
          <Link
            href="/merchant/messages"
            className="grid size-11 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
            aria-label="All messages"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
            {initials(name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-ink-900">{name}</span>
            <span className="block text-xs text-ink-600">Student</span>
          </span>
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
        </header>
        {chat.blocked && (
          <p className="mb-2 rounded-xl bg-ink-50 px-4 py-2.5 text-center text-sm text-ink-600">
            You&apos;ve blocked {name}. They can&apos;t send you messages until you unblock them.
          </p>
        )}
        <ChatThread
          conversationId={id}
          me="merchant"
          initialMessages={messages}
          blocked={false}
          blockedText=""
          emptyText="No messages yet."
        />
      </div>
    </AreaShell>
  );
}
