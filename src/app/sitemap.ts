import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/merchants`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/install`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
