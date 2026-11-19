import type { Metadata } from "next";
import Link from "next/link";
import { Gift, MessageCircle, Search, Users } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { initials } from "@/features/students/app/bits";
import { FriendButton, SocialSettingsForm } from "@/features/friends/components/friend-forms";
import { markSharedDealsSeen, openFriendChat } from "@/features/friends/actions";
import {
  getSocialSettings,
  listBlockedStudents,
  listFriendChats,
  listFriendRequests,
  listFriends,
  listSharedDeals,
  searchClassmates,
} from "@/features/friends/queries";
import { friendsErrorMessage, type Classmate } from "@/features/friends/schemas";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Friends", robots: { index: false } };

const card = "rounded-3xl bg-white p-4 ring-1 ring-ink-200/70 sm:p-5";
const ago = new Intl.RelativeTimeFormat("en-GH", { numeric: "auto" });
function since(iso: string) {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return days === 0 ? "today" : ago.format(days, "day");
}

function Person({ name, sub, children }: { name: string; sub?: string | null; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 font-display font-bold text-blue-700">
        {initials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink-900">{name}</span>
        {sub && <span className="block truncate text-sm text-ink-600">{sub}</span>}
      </span>
      {children && <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">{children}</span>}
    </li>
  );
}

function SearchResult({ c }: { c: Classmate }) {
  const sub = [c.programme, c.level].filter(Boolean).join(" · ") || null;
  return (
    <Person name={c.name} sub={sub}>
      {c.relation === "none" && <FriendButton userId={c.user_id} op="add" label="Add friend" variant="primary" />}
      {c.relation === "requested" && <span className="text-sm font-medium text-ink-600">Request sent</span>}
      {c.relation === "incoming" && <FriendButton userId={c.user_id} op="accept" label="Accept" variant="primary" />}
      {c.relation === "friends" && <span className="text-sm font-medium text-emerald-700">Friends</span>}
    </Person>
  );
}

export default async function FriendsPage({ searchParams }: PageProps<"/student/friends">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";
  const [settings, friends, requests, shared, chats, blocked, search] = await Promise.all([
    getSocialSettings(),
    listFriends(),
    listFriendRequests(),
    listSharedDeals(),
    listFriendChats(),
    listBlockedStudents(),
    q.length >= 2 ? searchClassmates(q) : Promise.resolve(null),
  ]);
  const incoming = requests.filter((r) => r.direction === "incoming");
  const outgoing = requests.filter((r) => r.direction === "outgoing");
  if (shared.some((s) => !s.seen)) await markSharedDealsSeen();

  return (
    <AreaShell area="student">
      <PageTitle title="Friends" description="Find classmates from your school, share deals and see what your friends are up to." />
      {params.chat === "unavailable" && (
        <p role="alert" className="mb-6 rounded-2xl bg-orange-50 px-4 py-3 font-medium text-ink-900">
          You can only message friends.
        </p>
      )}

      <div className="grid max-w-2xl gap-5">
        <section aria-labelledby="find-h" className={card}>
          <h2 id="find-h" className="font-display text-lg font-bold">
            Find classmates
          </h2>
          <p className="mt-1 text-sm text-ink-600">Only verified students at your school who chose to be findable show up.</p>
          <form
            role="search"
            action="/student/friends"
            className="mt-3 flex h-12 items-center gap-2 rounded-full bg-ink-100 px-4 focus-within:ring-2 focus-within:ring-blue-500"
          >
            <Search className="size-5 text-ink-600" aria-hidden />
            <label htmlFor="friend-q" className="sr-only">
              Search by name
            </label>
            <input
              id="friend-q"
              name="q"
              type="search"
              defaultValue={q}
              minLength={2}
              maxLength={60}
              placeholder="Search by name"
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-600"
            />
          </form>
          {q.length === 1 && <p className="mt-3 text-sm text-ink-600">Type at least 2 letters.</p>}
          {search &&
            (search.error ? (
              <p role="alert" className="mt-3 text-sm font-medium text-red-700">
                {friendsErrorMessage(search.error)}
              </p>
            ) : search.results.length === 0 ? (
              <p className="mt-3 text-sm text-ink-600">
                No one found for &ldquo;{q}&rdquo;. Your classmate may not have turned on &ldquo;Let classmates find me&rdquo; yet.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-ink-100">
                {search.results.map((c) => (
                  <SearchResult key={c.user_id} c={c} />
                ))}
              </ul>
            ))}
        </section>

        {incoming.length > 0 && (
          <section aria-labelledby="req-h" className={card}>
            <h2 id="req-h" className="font-display text-lg font-bold">
              Friend requests
            </h2>
            <ul className="mt-1 divide-y divide-ink-100">
              {incoming.map((r) => (
                <Person key={r.user_id} name={r.name} sub={r.programme}>
                  <FriendButton userId={r.user_id} op="accept" label="Accept" variant="primary" />
                  <FriendButton userId={r.user_id} op="decline" label="Decline" variant="ghost" />
                </Person>
              ))}
            </ul>
          </section>
        )}

        {shared.length > 0 && (
          <section aria-labelledby="shared-h" className={card}>
            <h2 id="shared-h" className="flex items-center gap-2 font-display text-lg font-bold">
              <Gift className="size-5 text-orange-500" aria-hidden /> Deals friends sent you
            </h2>
            <ul className="mt-1 divide-y divide-ink-100">
              {shared.map((s) => (
                <li key={s.id} className="py-3">
                  {s.live ? (
                    <Link href={`/student/offers/${s.offer_id}`} className="group block">
                      <span className="block font-semibold text-ink-900 group-hover:text-blue-600">
                        {s.offer_title} · {s.merchant_name}
                      </span>
                      <span className="block text-sm text-ink-600">
                        From {s.sender_name}, {since(s.created_at)}
                        {s.note ? `: “${s.note}”` : ""}
                      </span>
                    </Link>
                  ) : (
                    <>
                      <span className="block font-semibold text-ink-600">
                        {s.offer_title} · {s.merchant_name}
                      </span>
                      <span className="block text-sm text-ink-600">From {s.sender_name}. This deal has ended.</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {chats.length > 0 && (
          <section aria-labelledby="chats-h" className={card}>
            <h2 id="chats-h" className="font-display text-lg font-bold">
              Chats
            </h2>
            <ul className="mt-1 divide-y divide-ink-100">
              {chats.map((c) => (
                <li key={c.id}>
                  <Link href={`/student/friends/chat/${c.id}`} className="flex items-center gap-3 py-3">
                    <span
                      aria-hidden
                      className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 font-display font-bold text-blue-700"
                    >
                      {initials(c.friend_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-ink-900", c.unread > 0 ? "font-bold" : "font-semibold")}>
                        {c.friend_name}
                      </span>
                      <span className="block truncate text-sm text-ink-600">
                        {c.last_from_me ? "You: " : ""}
                        {c.last_message_preview}
                      </span>
                    </span>
                    {c.unread > 0 && (
                      <span className="grid size-6 place-items-center rounded-full bg-blue-500 text-xs font-bold text-white">
                        {c.unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="friends-h" className={card}>
          <h2 id="friends-h" className="font-display text-lg font-bold">
            Your friends {friends.length > 0 && <span className="text-ink-600">({friends.length})</span>}
          </h2>
          {friends.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <span className="mb-2 grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <Users className="size-7" aria-hidden />
              </span>
              <p className="max-w-[34ch] text-[0.9375rem] text-ink-600">
                No friends yet. Search for a classmate above, or ask them to search for you.
              </p>
            </div>
          ) : (
            <ul className="mt-1 divide-y divide-ink-100">
              {friends.map((f) => (
                <Person key={f.user_id} name={f.name} sub={[f.programme, f.level].filter(Boolean).join(" · ") || null}>
                  <form action={openFriendChat}>
                    <input type="hidden" name="userId" value={f.user_id} />
                    <button
                      type="submit"
                      aria-label={`Message ${f.name}`}
                      className="grid size-10 place-items-center rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      <MessageCircle className="size-5" aria-hidden />
                    </button>
                  </form>
                  <details className="relative">
                    <summary className="grid h-10 cursor-pointer list-none place-items-center rounded-full px-3 text-sm font-semibold text-ink-700 hover:bg-ink-100 [&::-webkit-details-marker]:hidden">
                      More<span className="sr-only"> for {f.name}</span>
                    </summary>
                    <div className="absolute right-0 z-10 mt-1 flex w-48 flex-col items-stretch gap-1 rounded-2xl bg-white p-2 shadow-lift ring-1 ring-ink-200">
                      <FriendButton
                        userId={f.user_id}
                        op="remove"
                        label="Remove friend"
                        variant="ghost"
                        confirm={`Remove ${f.name} from your friends?`}
                      />
                      <FriendButton
                        userId={f.user_id}
                        op="block"
                        label="Block"
                        variant="ghost"
                        confirm={`Block ${f.name}? They won't be able to find you, message you or send you deals.`}
                      />
                      <Link
                        href={`/student/friends/report/${f.user_id}`}
                        className="rounded-full px-4 py-2 text-right text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        Report
                      </Link>
                    </div>
                  </details>
                </Person>
              ))}
            </ul>
          )}
          {outgoing.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-ink-600">Waiting for a reply</h3>
              <ul className="divide-y divide-ink-100">
                {outgoing.map((r) => (
                  <Person key={r.user_id} name={r.name} sub={r.programme}>
                    <FriendButton userId={r.user_id} op="remove" label="Cancel" variant="ghost" />
                  </Person>
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="privacy-h" className={card}>
          <h2 id="privacy-h" className="font-display text-lg font-bold">
            Privacy
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Both are off until you turn them on. Your ID photo and selfie are never shown to other students.
          </p>
          <div className="mt-2">
            <SocialSettingsForm settings={settings} />
          </div>
          {blocked.length > 0 && (
            <details className="mt-3 border-t border-ink-100 pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink-700">Blocked students ({blocked.length})</summary>
              <ul className="mt-1 divide-y divide-ink-100">
                {blocked.map((b) => (
                  <Person key={b.user_id} name={b.name}>
                    <FriendButton userId={b.user_id} op="unblock" label="Unblock" variant="ghost" />
                  </Person>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
    </AreaShell>
  );
}
