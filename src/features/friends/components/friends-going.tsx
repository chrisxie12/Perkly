import { friendsGoing } from "../queries";

/** Under a Campus event: friends who are going (only those who share their activity). */
export async function FriendsGoing({ postId }: { postId: string }) {
  const going = await friendsGoing(postId);
  if (going.length === 0) return null;
  const first = going.slice(0, 2).map((f) => f.name.split(" ")[0]);
  const rest = going.length - first.length;
  return (
    <p className="mt-3 text-sm font-medium text-ink-700">
      {first.join(" and ")}
      {rest > 0 ? ` and ${rest} more ${rest === 1 ? "friend" : "friends"}` : ""} {going.length === 1 ? "is" : "are"} going.
    </p>
  );
}
