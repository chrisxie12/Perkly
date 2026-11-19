import { shareImage, shareImageSize } from "@/lib/og/share-image";

export const alt = "Perqly for businesses: bring verified students to your counter.";
export const size = shareImageSize;
export const contentType = "image/png";

export default function MerchantsOpengraphImage() {
  return shareImage({
    headline: ["Bring students", "to your counter."],
    sub: "List a student price on Perqly. Verified students find you, scan your QR and pay you directly.",
    tag: "For businesses near campus",
    card: { label: "Students near you", big: "QR", small: "scan, confirm, done" },
  });
}
