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
};

export function mergeInbox(a: InboxItem[], b: InboxItem[]) {
  return [...a, ...b].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
}

export type InboxFilter = "all" | "unread" | "friend" | "shop";

export function filterInbox(items: InboxItem[], filter: InboxFilter, q: string) {
  const needle = q.trim().toLocaleLowerCase();
  return items.filter(
    (i) =>
      (filter === "all" || (filter === "unread" ? i.unread > 0 : i.kind === filter)) &&
      (!needle || i.title.toLocaleLowerCase().includes(needle) || (i.preview ?? "").toLocaleLowerCase().includes(needle)),
  );
}
