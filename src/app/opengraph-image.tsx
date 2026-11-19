import { shareImage, shareImageSize } from "@/lib/og/share-image";

export const alt = "Perqly: student prices at the shops around campus.";
export const size = shareImageSize;
export const contentType = "image/png";

export default function OpengraphImage() {
  return shareImage({
    headline: ["Show your pass.", "Pay the student price."],
    sub: "Discounts at food spots, print shops and barbers near campus. Verified students only, free on any phone.",
    tag: "Launching first at GCTU",
    card: { label: "Example deal", saving: 10, small: "off your first cut" },
  });
}
