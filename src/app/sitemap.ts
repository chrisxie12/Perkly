import type { MetadataRoute } from "next";
import { getSiteUrl, isProductionEnv } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isProductionEnv()) return [];
  const base = getSiteUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/merchants`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/install`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/delete-account`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
