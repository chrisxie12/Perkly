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
const PRIVATE_PREFIXES = ["/student", "/merchant", "/institution", "/admin", "/account", "/r", "/api", "/auth", "/login", "/register"];

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
type PushPayload = { id?: string; title?: string; body?: string; url?: string; tag?: string };

const samePath = (url: unknown) =>
  typeof url === "string" && /^\/[A-Za-z0-9/_?=&.-]*$/.test(url) && !url.startsWith("//") ? url : "/account/notifications";

self.addEventListener("push", (event) => {
  let data: PushPayload = {};
  try {
    data = (event.data?.json() ?? {}) as PushPayload;
  } catch {
    data = { body: event.data?.text() };
  }
  const url = samePath(data.url);
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || "Perqly", {
        body: data.body || undefined,
        icon: "/icon-192.png",
        tag: data.tag,
        data: { url },
      });
      // Open tabs update their bell straight away.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "PERQLY_NOTIFICATION" });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = samePath((event.notification.data as { url?: unknown } | null)?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) await (open as WindowClient).navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

serwist.addEventListeners();
