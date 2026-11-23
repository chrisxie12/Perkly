export const siteConfig = {
  name: "Perqly",
  tagline: "Student benefits. Real campus value.",
  description:
    "Perqly gets verified tertiary students real discounts at shops, food spots and services around campus. Live at GCTU, Accra.",
  pilotInstitution: "GCTU",
  pilotInstitutionLong: "Ghana Communication Technology University",
  // White, like the app's top bar, so the phone's status and navigation bars blend in.
  themeColor: "#FFFFFF",
  backgroundColor: "#FFFFFF",
} as const;

export const marketingNav = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#students", label: "For students" },
  { href: "/merchants", label: "For businesses" },
  { href: "/#faq", label: "FAQ" },
] as const;
