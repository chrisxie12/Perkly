import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/student", "/merchant", "/institution", "/admin", "/r/", "/api", "/auth", "/login", "/register", "/design", "/offline"],
      },
    ],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
