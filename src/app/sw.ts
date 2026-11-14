import { defaultCache } from "@serwist/turbopack/worker";
import { NetworkOnly, Serwist, type PrecacheEntry, type RuntimeCaching, type SerwistGlobalConfig } from "serwist";

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
const PRIVATE_PREFIXES = ["/student", "/merchant", "/institution", "/admin", "/r", "/api", "/auth", "/login", "/register"];

const isPrivatePath = (pathname: string) => PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const privateFirst: RuntimeCaching[] = [
  {
    // Cross-origin requests (Supabase auth, database, storage, realtime)
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

serwist.addEventListeners();
