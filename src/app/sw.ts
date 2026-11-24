import { defaultCache } from "@serwist/turbopack/worker";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type RuntimeCaching,
  type SerwistGlobalConfig,
} from "serwist";
import { threadText } from "../lib/notifications/style";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Paths that may hold private data. They are NEVER cached by the service
 * worker: student records, merchant and institution screens, admin tools,
 * auth and every API route. Offline, they fall back to /offline.
 */
// Keep in step with src/lib/auth/paths.ts. "/r" is the merchant QR link (docs/PERQLY_QR_REDEMPTION_SPECIFICATION.md §2.3).
// "/organise" is the Campus organiser area; "/campus" holds public Campus pages whose signed image links expire.
const PRIVATE_PREFIXES = [
  "/student",
  "/merchant",
  "/institution",
  "/admin",
  "/organise",
  "/campus",
  "/account",
  "/r",
  "/api",
  "/auth",
  "/login",
  "/register",
];

const isPrivatePath = (pathname: string) => PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const privateFirst: RuntimeCaching[] = [
  {
    // Public OpenStreetMap tiles for the deals map: no tokens, safe to keep a
    // week's worth so the map opens fast and OSM gets fewer requests.
    matcher: ({ url }) => url.hostname === "tile.openstreetmap.org",
    handler: new CacheFirst({
      cacheName: "map-tiles",
      plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 7 * 24 * 60 * 60 })],
    }),
  },
  {
    // Other cross-origin requests (Supabase auth, database, storage, realtime)
    // carry tokens or private data. Never cache them.
    matcher: ({ sameOrigin }) => !sameOrigin,
    handler: new NetworkOnly(),
  },
  {
    // Private app areas, including their React Server Component payloads.
    matcher: ({ url, sameOrigin }) => sameOrigin && isPrivatePath(url.pathname),
    handler: new NetworkOnly(),
  },
  {
    // Anything that isn't a GET (form posts, Server Actions) is never cached.
    matcher: ({ request }) => request.method !== "GET",
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Don't take over open tabs mid-session; the app shows an "Update
  // available" prompt and the user chooses when to refresh.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  // Order matters: the private rules must match before the defaults.
  runtimeCaching: [...privateFirst, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

// Lets the page ask a waiting service worker to activate.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// Phone notifications -----------------------------------------------------------------
// Messaging-app behaviour: each chat is one thread that collects its latest messages,
// other types replace the older one of the same type; Reply and Mark as read buttons;
// opening the chat in the app clears its notification (the page closes it by tag).
type PushPayload = {
  id?: string;
  title?: string;
  body?: string;
  url?: string;
  link?: string;
  tag?: string;
  group?: string;
  icon?: string;
};
type ThreadData = { url: string; link: string; ids: string[]; lines: string[]; group: string };

const samePath = (url: unknown) =>
  typeof url === "string" && /^\/[A-Za-z0-9/_?=&.-]*$/.test(url) && !url.startsWith("//") ? url : "/account/notifications";
const ourIcon = (icon: unknown) => (typeof icon === "string" && /^\/icons\/notify\/[a-z]+\.png$/.test(icon) ? icon : "/icons/icon-192.png");

self.addEventListener("push", (event) => {
  let data: PushPayload = {};
  try {
    data = (event.data?.json() ?? {}) as PushPayload;
  } catch {
    data = { body: event.data?.text() };
  }
  const url = samePath(data.url);
  const link = samePath(data.link);
  const tag = typeof data.tag === "string" && data.tag.length <= 200 ? data.tag : undefined;
  const isChat = data.group === "chat";
  event.waitUntil(
    (async () => {
      // A chat that already has a notification on the phone: add this message to it.
      let previous: ThreadData | null = null;
      if (isChat && tag) {
        const open = await self.registration.getNotifications({ tag });
        previous = (open[0]?.data as ThreadData | undefined) ?? null;
      }
      const thread = threadText(previous?.lines ?? [], data.body ?? "");
      const ids = [...(previous?.ids ?? []), ...(data.id ? [data.id] : [])].slice(-20);
      const title = data.title || "Perqly";
      await self.registration.showNotification(isChat && thread.count > 1 ? `${title} (${thread.count} new messages)` : title, {
        body: (isChat ? thread.body : data.body) || undefined,
        icon: ourIcon(data.icon),
        // Android shows this small white mark in the status bar.
        badge: "/icons/badge-96.png",
        tag,
        // Ring and buzz again even when this replaces an earlier notification with the same tag.
        renotify: Boolean(tag),
        vibrate: [80, 40, 80],
        silent: false,
        timestamp: Date.now(),
        actions: isChat
          ? [
              { action: "reply", title: "Reply" },
              { action: "read", title: "Mark as read" },
            ]
          : [{ action: "open", title: "View" }],
        data: { url, link, ids, lines: thread.lines, group: data.group ?? "general" } satisfies ThreadData,
        // renotify, vibrate, timestamp and actions work on Android but aren't all in TypeScript's DOM types yet.
      } as NotificationOptions & { renotify: boolean; vibrate: number[]; timestamp: number; actions: { action: string; title: string }[] });
      // Open tabs update their bell straight away.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows)
        client.postMessage({
          type: "PERQLY_NOTIFICATION",
          notification: { id: data.id, title: data.title, body: data.body, link: data.link, group: data.group },
        });
    })(),
  );
});

/** Mark every notification in a thread read, the way tapping it would, without opening anything. */
async function markRead(ids: string[]) {
  await Promise.all(
    ids
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .map((id) => fetch(`/account/notifications/open/${id}`, { redirect: "manual", credentials: "same-origin" }).catch(() => undefined)),
  );
}

async function openInApp(url: string) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (open) {
    await open.focus();
    if ("navigate" in open) await (open as WindowClient).navigate(url);
    return;
  }
  await self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as Partial<ThreadData>;
  const url = samePath(data.url);
  const ids = Array.isArray(data.ids) ? data.ids : [];
  event.waitUntil(
    (async () => {
      if (event.action === "read") {
        await markRead(ids);
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of windows) client.postMessage({ type: "PERQLY_NOTIFICATIONS_READ" });
        return;
      }
      // Reply, View or a tap: the older ones in the thread are read too, then open it.
      if (ids.length > 1) await markRead(ids.slice(0, -1));
      await openInApp(url);
    })(),
  );
});

serwist.addEventListeners();
