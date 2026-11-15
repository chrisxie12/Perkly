// Shop page vocabulary and checks shared by the business editor and the student page.
// The lists match the database's check constraints (migration 0017).

export const PAYMENT_METHODS = ["Cash", "MTN MoMo", "Telecel Cash", "AT Money", "Card"] as const;
export const AMENITIES = [
  "Dine-in",
  "Takeaway",
  "Delivery to campus",
  "Seating",
  "Wi-Fi",
  "Toilet",
  "Wheelchair access",
  "Parking",
] as const;
export const MAX_PHOTOS = 10;

export const SOCIALS = [
  { key: "instagram", label: "Instagram", url: (h: string) => `https://instagram.com/${h}` },
  { key: "tiktok", label: "TikTok", url: (h: string) => `https://www.tiktok.com/@${h}` },
  { key: "facebook", label: "Facebook", url: (h: string) => `https://facebook.com/${h}` },
  { key: "x", label: "X", url: (h: string) => `https://x.com/${h}` },
  { key: "snapchat", label: "Snapchat", url: (h: string) => `https://www.snapchat.com/add/${h}` },
] as const;
export type SocialKey = (typeof SOCIALS)[number]["key"];

export const MAPS_LINK_RE = /^https:\/\/([a-z0-9.-]*google\.[a-z.]+\/maps|maps\.app\.goo\.gl\/|goo\.gl\/maps\/|maps\.google\.[a-z.]+\/)/i;

/** Coordinates written into a full Google Maps link (@lat,lng · q=lat,lng · !3dlat!4dlng). Short links carry none. */
export function coordsFromMapsLink(url: string): { latitude: number; longitude: number } | null {
  const patterns = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const latitude = Number(m[1]);
      const longitude = Number(m[2]);
      if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude };
    }
  }
  return null;
}

/** A link that opens Google Maps at the branch: the business's own link, else its coordinates, else its address. */
export function directionsUrl(b: {
  maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}) {
  if (b.maps_url) return b.maps_url;
  if (b.latitude != null && b.longitude != null) return `https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`;
  if (b.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`;
  return null;
}

/** wa.me wants the full international number with no + or spaces. Ghana local numbers start with 0. */
export function whatsappUrl(number: string) {
  const digits = number.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `233${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

export function telUrl(number: string) {
  return `tel:${number.replace(/\s/g, "")}`;
}

export type ShopChecklistInput = {
  photos: number;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  branches: { maps_url: string | null; latitude: number | null; landmark: string | null; has_hours: boolean }[];
  socials: Record<string, string>;
  payment_methods: string[];
};

/** What a complete shop page has, in the order the business is asked to fill it in. */
export function shopChecklist(s: ShopChecklistInput) {
  const items = [
    { key: "photos", label: "At least 3 photos", done: s.photos >= 3 },
    { key: "about", label: "A short description (40+ characters)", done: (s.description?.trim().length ?? 0) >= 40 },
    { key: "phone", label: "A phone number", done: Boolean(s.phone) },
    { key: "whatsapp", label: "A WhatsApp number", done: Boolean(s.whatsapp) },
    {
      key: "map",
      label: "Every branch on the map",
      done: s.branches.length > 0 && s.branches.every((b) => b.maps_url || b.latitude != null),
    },
    { key: "landmark", label: "A landmark for every branch", done: s.branches.length > 0 && s.branches.every((b) => b.landmark) },
    { key: "hours", label: "Opening hours for every branch", done: s.branches.length > 0 && s.branches.every((b) => b.has_hours) },
    { key: "social", label: "One social account", done: Object.values(s.socials).some(Boolean) },
    { key: "payments", label: "Ways to pay", done: s.payment_methods.length > 0 },
  ];
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}

export function shopPhotoUrl(supabaseUrl: string, path: string) {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/merchant-photos/${path}`;
}
