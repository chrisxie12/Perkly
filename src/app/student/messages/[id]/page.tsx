import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { setBusinessBlocked } from "@/features/chat/actions";
import { getConversation } from "@/features/chat/queries";
import { ChatMenu } from "@/features/chat/room/chat-menu";
import { ChatRoom } from "@/features/chat/room/chat-room";
import { RoomHeader } from "@/features/chat/room/room-header";
import { getChatPref, loadRoom } from "@/features/chat/room/server";
import { telUrl, whatsappUrl } from "@/features/merchants/shop";
import { getCoverPhotos, listDeals } from "@/features/offers/queries";
import { money } from "@/features/offers/schemas";
import { formatRunTimes, isEveryDay } from "@/features/offers/run-times";
import { initials } from "@/features/students/app/format";
import { draftFrom } from "@/features/share/model";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function StudentChatPage({ params, searchParams }: PageProps<"/student/messages/[id]">) {
  const { id } = await params;
  const draft = draftFrom((await searchParams).draft);
  const [chat, ctx] = await Promise.all([getConversation(id), getUserContext()]);
  if (!chat || chat.side !== "student" || !ctx) notFound();
  const me = { kind: "shop", side: "student", userId: ctx.userId } as const;
  const [room, covers, pref] = await Promise.all([loadRoom("shop", id, me), getCoverPhotos([chat.merchant_id]), getChatPref("shop", id)]);
  const cover = covers.get(chat.merchant_id) ?? null;
  // Before the first message: the shop and up to two of its deals, so the student knows what to ask about.
  const deals = room.messages.length === 0 ? (await listDeals({ merchantId: chat.merchant_id })).slice(0, 2) : [];
  const shopHref = `/student/merchants/${chat.merchant_slug}`;
  const youBlocked = Boolean(chat.blocked_by_student);

  const intro = (
    <div className="mx-auto max-w-sm rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-ink-200/70">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- public storage URL
        <img src={cover} alt="" className="mx-auto size-16 rounded-full object-cover" />
      ) : (
        <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-blue-50 text-xl font-bold text-blue-700">
          {initials(chat.merchant_name)}
        </span>
      )}
      <p className="mt-2 font-display text-lg font-bold text-ink-900">{chat.merchant_name}</p>
      <p className="mt-1 text-sm text-ink-600">Ask about a deal, opening times or anything else. The owners and managers reply here.</p>
      {deals.length > 0 && (
        <ul className="mt-3 space-y-2 text-left">
          {deals.map((d) => (
            <li key={d.offer_id}>
              <Link
                href={`/student/offers/${d.offer_id}`}
                className="flex items-center justify-between gap-3 rounded-2xl bg-ink-50 px-3 py-2.5 hover:bg-ink-100"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink-900">{d.title}</span>
                  {!isEveryDay({ run_days: d.run_days ?? null, run_from: d.run_from ?? null, run_until: d.run_until ?? null }) && (
                    <span className="block truncate text-xs text-ink-600">
                      {formatRunTimes({ run_days: d.run_days ?? null, run_from: d.run_from ?? null, run_until: d.run_until ?? null })}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-bold text-ink-900">{money(d.final_price)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <AreaShell area="student">
      <div className="max-w-2xl">
        <RoomHeader
          backHref="/student/messages"
          backLabel="All chats"
          name={chat.merchant_name}
          sub="Business · See shop"
          photo={cover}
          nameHref={shopHref}
          chatId={id}
        >
          <form action={setBusinessBlocked}>
            <input type="hidden" name="conversationId" value={id} />
            <input type="hidden" name="blocked" value={youBlocked ? "false" : "true"} />
            <button
              type="submit"
              aria-label={youBlocked ? `Unblock ${chat.merchant_name}` : `Block ${chat.merchant_name}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-700 hover:bg-ink-100"
            >
              <Ban className="size-4" aria-hidden />
              {youBlocked ? "Unblock" : "Block"}
            </button>
          </form>
          <ChatMenu
            kind="shop"
            chatId={id}
            muted={pref.muted}
            archived={pref.archived}
            inboxHref="/student/messages"
            viewHref={shopHref}
            viewLabel="View shop"
            links={[
              ...(chat.merchant_phone ? [{ label: "Call", href: telUrl(chat.merchant_phone), icon: "phone" as const }] : []),
              ...(chat.merchant_whatsapp
                ? [{ label: "WhatsApp", href: whatsappUrl(chat.merchant_whatsapp), icon: "whatsapp" as const, external: true }]
                : []),
            ]}
          />
        </RoomHeader>
        {youBlocked && (
          <p className="mb-2 rounded-xl bg-ink-50 px-4 py-2.5 text-center text-sm text-ink-600">
            You&apos;ve blocked {chat.merchant_name}. They can&apos;t message you, and you won&apos;t get notifications from this chat,
            until you unblock them.
          </p>
        )}
        <ChatRoom
          kind="shop"
          chatId={id}
          me={me}
          otherName={chat.merchant_name}
          initialMessages={room.messages}
          initialReactions={room.reactions}
          initialOtherReadAt={chat.other_read_at ?? null}
          blocked={chat.blocked || youBlocked}
          blockedText={youBlocked ? "Unblock this business to send a message." : "This business isn't taking messages from you."}
          emptyText={`Ask ${chat.merchant_name} about a deal, opening times or anything else.`}
          emptyCard={intro}
          initialDraft={draft}
        />
      </div>
    </AreaShell>
  );
}
