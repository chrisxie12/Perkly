import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SerwistProvider } from "@serwist/turbopack/react";
import { UpdatePrompt } from "@/components/shared/update-prompt";
import { siteConfig } from "@/config/site";
import { getSiteUrl } from "@/lib/env";
import "./globals.css";

const bricolage = localFont({
  src: "./fonts/bricolage-grotesque.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
  preload: true,
});

const figtree = localFont({
  src: "./fonts/figtree.woff2",
  variable: "--font-figtree",
  weight: "300 900",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: siteConfig.name,
  title: {
    default: `${siteConfig.name}: student discounts near campus`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  appleWebApp: {
    capable: true,
    title: siteConfig.name,
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: `${siteConfig.name}: student discounts near campus`,
    description: siteConfig.description,
    locale: "en_GH",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name}: student discounts near campus`,
    description: siteConfig.description,
  },
};

export const viewport: Viewport = {
  themeColor: siteConfig.themeColor,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GH" className={`${bricolage.variable} ${figtree.variable} antialiased`}>
      <body className="min-h-dvh">
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
          {children}
          <UpdatePrompt />
        </SerwistProvider>
      </body>
    </html>
  );
}
