import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/student",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: siteConfig.themeColor,
    background_color: siteConfig.backgroundColor,
    categories: ["shopping", "lifestyle", "education"],
    lang: "en-GH",
    shortcuts: [
      { name: "Scan to redeem", short_name: "Scan", url: "/student/scan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Your savings", short_name: "Savings", url: "/student/history" },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
