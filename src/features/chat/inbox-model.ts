/** The one Chats inbox: pure helpers, safe on server and client. */

export type InboxItem = {
  key: string;
  kind: "shop" | "friend";
  title: string;
  href: string;
  photo: string | null;
  preview: string | null;
  fromMe: boolean;
  at: string;
  unread: number;
  closed: boolean;
  /** Archived by me, with nothing new since. */
  archived?: boolean;
  muted?: boolean;
};

export function mergeInbox(a: InboxItem[], b: InboxItem[]) {
  return [...a, ...b].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
}

export type InboxFilter = "all" | "unread" | "friend" | "shop" | "archived";

export function filterInbox(items: InboxItem[], filter: InboxFilter, q: string) {
  const needle = q.trim().toLocaleLowerCase();
  return items.filter(
    (i) =>
      (filter === "archived"
        ? Boolean(i.archived)
        : !i.archived && (filter === "all" || (filter === "unread" ? i.unread > 0 : i.kind === filter))) &&
      (!needle || i.title.toLocaleLowerCase().includes(needle) || (i.preview ?? "").toLocaleLowerCase().includes(needle)),
  );
}

/** Mark chats I've archived or muted. An archived chat comes back when a new message arrives. */
export function applyPrefs(
  items: InboxItem[],
  prefs: { kind: "shop" | "friend"; chat_id: string; muted: boolean; archived_at: string | null }[],
) {
  const byKey = new Map(prefs.map((p) => [`${p.kind}:${p.chat_id}`, p]));
  return items.map((i) => {
    const p = byKey.get(i.key);
    if (!p) return i;
    const archived = !!p.archived_at && new Date(i.at).getTime() <= new Date(p.archived_at).getTime();
    return { ...i, muted: p.muted, archived };
  });
}
