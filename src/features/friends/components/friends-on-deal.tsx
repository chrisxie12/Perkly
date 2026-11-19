import Link from "next/link";
import { initials } from "@/features/students/app/bits";
import { friendsOnOffer, listFriends } from "../queries";
import { ShareDealButton } from "./friend-forms";

/** On a deal page, for verified students: friends who used it or saved the shop, and "Send to a friend". */
export async function FriendsOnDeal({ offerId }: { offerId: string }) {
  const [onDeal, friends] = await Promise.all([friendsOnOffer(offerId), listFriends()]);
  if (friends.length === 0) {
    return (
      <p className="mt-4 rounded-3xl bg-white p-4 text-sm text-ink-600 ring-1 ring-ink-200/70">
        <Link href="/student/friends" className="font-semibold text-blue-600 hover:underline">
          Add friends from your school
        </Link>{" "}
        to see which deals they use and send them this one.
      </p>
    );
  }
  const used = onDeal.filter((f) => f.kind === "used");
  const saved = onDeal.filter((f) => f.kind === "saved");
  const names = (list: { name: string }[]) =>
    list.length === 1 ? list[0].name.split(" ")[0] : `${list[0].name.split(" ")[0]} and ${list.length - 1} more`;
  return (
    <section aria-label="Friends" className="mt-4 flex flex-wrap items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-ink-200/70">
      {onDeal.length > 0 && (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex shrink-0" aria-hidden>
            {onDeal.slice(0, 3).map((f, i) => (
              <span
                key={f.user_id}
                className={`grid size-9 place-items-center rounded-full border-2 border-white bg-blue-50 text-xs font-bold text-blue-700 ${i > 0 ? "-ml-2.5" : ""}`}
              >
                {initials(f.name)}
              </span>
            ))}
          </span>
          <p className="min-w-0 text-sm text-ink-700">
            {used.length > 0 && <>{names(used)} used this deal. </>}
            {saved.length > 0 && <>{names(saved)} saved this shop.</>}
          </p>
        </div>
      )}
      <ShareDealButton offerId={offerId} friends={friends.map((f) => ({ user_id: f.user_id, name: f.name }))} />
    </section>
  );
}
