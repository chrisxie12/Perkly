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
    // Installed Perqly opens edge to edge with no status or navigation bars on
    // Android; phones that can't do that fall back to a normal app window.
    // Screens already pad for notches and home bars (pt-safe / pb-safe).
    // Standalone: no browser bars, but the phone's status bar (time, battery) stays visible.
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    theme_color: siteConfig.themeColor,
    background_color: siteConfig.backgroundColor,
    categories: ["shopping", "lifestyle", "education"],
    lang: "en-GH",
    // "Share to Perqly" in the phone's share menu: pick a chat, the text waits in its message box.
    share_target: { action: "/student/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
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
