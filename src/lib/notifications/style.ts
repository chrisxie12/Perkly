/**
 * How a notification looks and groups, by its kind, for phone notifications and the in-app
 * banner alike. Messaging-app rules: each chat is its own thread (newer messages join it),
 * everything else of one type replaces the older one. Pure, so it's shared and tested.
 */

export type NotificationGroup = "chat" | "deal" | "verified" | "booking" | "campus" | "account" | "general";

const GROUPS: [prefix: string, group: NotificationGroup][] = [
  ["chat.", "chat"],
  ["friendchat.", "chat"],
  ["deal.", "deal"],
  ["friend.share", "deal"],
  ["verification.", "verified"],
  ["booking.", "booking"],
  ["campus.", "campus"],
  ["account.", "account"],
  ["team.", "account"],
  ["review.", "account"],
];

export function notificationGroup(kind: string | null | undefined): NotificationGroup {
  if (!kind) return "general";
  return GROUPS.find(([prefix]) => kind === prefix || kind.startsWith(prefix))?.[1] ?? "general";
}

/** The 3D picture shown with it (Fluent Emoji, MIT: public/icons/notify/LICENSE-fluent-emoji.txt). */
export function notificationIcon(group: NotificationGroup): string {
  return `/icons/notify/${group}.png`;
}

/**
 * One thread per chat; one slot per other type. A newer notification with the same tag
 * replaces or joins the older one instead of piling up.
 */
export function notificationTag(kind: string | null | undefined, link: string | null | undefined): string {
  const group = notificationGroup(kind);
  if (group === "chat" && link) return `chat:${link.split("?")[0]}`;
  return kind ? `kind:${kind}` : "perqly";
}

/** WhatsApp-style thread text: the latest few lines, oldest first, and how many in all. */
export function threadText(previous: string[], latest: string, keep = 5): { lines: string[]; count: number; body: string } {
  const all = [...previous, latest].filter((l) => l.trim().length > 0);
  const lines = all.slice(-keep);
  return { lines, count: all.length, body: lines.join("\n") };
}
