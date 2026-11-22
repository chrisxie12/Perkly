import { shareImage, shareImageSize } from "@/lib/og/share-image";
import { getDealPreview } from "@/features/offers/queries";
import { discountLabel } from "@/features/offers/schemas";
import { formatRunTimes, isEveryDay } from "@/features/offers/run-times";

export const alt = "A student deal on Perqly";
export const size = shareImageSize;
export const contentType = "image/png";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The picture WhatsApp shows for a shared deal: the shop, the item and the student saving. */
export default async function DealShareImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getDealPreview(id);
  if (!deal) {
    return shareImage({
      headline: ["Student deals", "near campus."],
      sub: "Verified students get real discounts at shops near campus with Perqly.",
      tag: "Student deals",
      card: { label: "Students save", big: "QR", small: "scan, confirm, done" },
    });
  }
  const when = isEveryDay(deal) ? "" : ` ${formatRunTimes(deal)}.`;
  return shareImage({
    headline: [clip(deal.merchant_name, 20), clip(deal.item, 20)],
    // The image font has no cedi sign, so prices read "GHS" here.
    sub: `${discountLabel(deal.discount_type, deal.discount_value).replace("GH₵", "GHS ")} for verified students with Perqly.${when}`,
    tag: deal.category ?? "Student deal",
    card:
      deal.discount_amount > 0
        ? { label: "Students save", saving: Math.round(deal.discount_amount), small: "with a Perqly pass" }
        : { label: "Student price", big: "Deal", small: "with a Perqly pass" },
  });
}
