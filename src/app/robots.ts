import type { MetadataRoute } from "next";
import { getSiteUrl, isProductionEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  // Staging previews and laptops: keep every crawler out.
  if (!isProductionEnv()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/student",
          "/merchant",
          "/institution",
          "/admin",
          "/account",
          "/r/",
          "/api",
          "/auth",
          "/login",
          "/register",
          "/design",
          "/offline",
        ],
      },
    ],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
