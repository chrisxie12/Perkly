import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import { buildCsp } from "./src/lib/security/csp";

/**
 * Security headers applied to every route.
 *
 * The Content-Security-Policy is built in src/lib/security/csp.ts. It allows
 * the configured Supabase project and nothing else outside this site.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    // Camera and location are used for scanning a merchant's QR (roadmap step 1.6).
    value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: buildCsp({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, isDev: process.env.NODE_ENV === "development" }),
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The service worker must never be cached by the browser or CDN,
        // so users always receive the newest version.
        source: "/serwist/:path*",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
