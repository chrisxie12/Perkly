import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AtSign, ChevronLeft, Clock, Footprints, Globe, Mail, MapPin, MessageCircle, Navigation, Phone, Wallet } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { cn } from "@/lib/utils";
import { getPublicEnv, hasSupabaseEnv } from "@/lib/env";
import { getMerchantPage, listDeals } from "@/features/offers/queries";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { DealRow, HeartButton, MerchantAvatar, toneFor, walkLabel } from "@/features/students/app/bits";
import { ShopGallery } from "@/features/students/app/shop-gallery";
import { DAYS, openLabel } from "@/features/merchants/hours";
import { SOCIALS, directionsUrl, shopPhotoUrl, telUrl, whatsappUrl } from "@/features/merchants/shop";

export const metadata: Metadata = { title: "Shop", robots: { index: false } };

function Action({ href, icon: Icon, label, missing }: { href: string | null; icon: typeof Phone; label: string; missing: string }) {
  const body = (
    <>
      <Icon className="size-5" aria-hidden />
      <span className="text-[0.8125rem] font-semibold">{label}</span>
    </>
  );
  const base = "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-center";
  if (!href)
    return (
      <span className={cn(base, "bg-ink-50 text-ink-400")} title={missing} aria-disabled="true">
        {body}
        <span className="sr-only">: {missing}</span>
      </span>
    );
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className={cn(base, "bg-blue-50 text-blue-800 hover:bg-blue-100")}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {body}
    </a>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-ink-100 px-4 py-6 sm:px-0">
      <h2 id={id} className="mb-3 font-display text-lg font-bold text-ink-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function ShopPage({ params }: PageProps<"/student/merchants/[slug]">) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) notFound();
  const [shop, status] = await Promise.all([getMerchantPage(slug), getMyStudentStatus()]);
  if (!shop) notFound();
  const deals = await listDeals({ merchantId: shop.id });
  const verified = verificationView(status) === "verified";
  const back = `/student/merchants/${shop.slug}`;
  const tone = toneFor(shop.category_slug);
  const nearest = shop.branches[0];
  const walk = walkLabel(nearest?.distance_m);
  const open = nearest ? openLabel(nearest) : null;
  const photoBase = hasSupabaseEnv() ? getPublicEnv().NEXT_PUBLIC_SUPABASE_URL : null;
  const photos = photoBase ? shop.photos.map((p) => ({ id: p.id, caption: p.caption, url: shopPhotoUrl(photoBase, p.path) })) : [];
  const socials = SOCIALS.filter((s) => shop.socials[s.key]);
  const phone = shop.phone ?? nearest?.phone ?? null;
  const directions = nearest ? directionsUrl(nearest) : null;

  return (
    <AreaShell area="student">
      <div className="-mx-4 -mt-6 sm:mx-0 sm:mt-0">
        <div className="flex items-center gap-1 px-2 py-1">
          <Link href="/student" aria-label="Back to deals" className="grid size-11 place-items-center rounded-full hover:bg-ink-100">
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
          <span className="flex-1" />
          <HeartButton merchantId={shop.id} saved={shop.is_favourite} back={back} label={shop.display_name} />
        </div>

        <div className="flex flex-col">
          {photos.length > 0 ? (
            <ShopGallery photos={photos} name={shop.display_name} />
          ) : (
            <div className="mx-4 h-24 rounded-3xl sm:mx-0" style={{ background: tone.bg }} aria-hidden />
          )}

          <header className="flex items-start gap-3 px-4 pt-4 sm:px-0">
            <MerchantAvatar name={shop.display_name} category={shop.category_slug} size="lg" className="-mt-10 ring-4 ring-white" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl leading-tight font-extrabold tracking-tight text-ink-900">{shop.display_name}</h1>
              <p className="text-[0.9375rem] text-ink-600">
                {[shop.category, nearest?.area, shop.price_range].filter(Boolean).join(" · ")}
              </p>
              {(open || walk) && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.9375rem]">
                  {open && (
                    <span className={cn("inline-flex items-center gap-1.5 font-semibold", open.open ? "text-emerald-700" : "text-ink-600")}>
                      <span className={cn("size-2 rounded-full", open.open ? "bg-emerald-600" : "bg-slate-400")} aria-hidden />
                      {open.text}
                    </span>
                  )}
                  {walk && (
                    <span className="inline-flex items-center gap-1.5 text-ink-700">
                      <Footprints className="size-4" aria-hidden />
                      {walk} from {nearest?.campus_name ?? "campus"}
                    </span>
                  )}
                </p>
              )}
            </div>
          </header>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 pt-5 pb-6 sm:px-0">
          <Action href={phone ? telUrl(phone) : null} icon={Phone} label="Call" missing="No phone number yet" />
          <Action
            href={shop.whatsapp ? whatsappUrl(shop.whatsapp) : null}
            icon={MessageCircle}
            label="WhatsApp"
            missing="No WhatsApp yet"
          />
          <Action href={directions} icon={Navigation} label="Directions" missing="No location yet" />
        </div>

        <Section id="deals-h" title="Student deals">
          {deals.length === 0 ? (
            <p className="text-ink-600">No deals right now. Save this shop to find it again when it adds one.</p>
          ) : (
            <ul className="space-y-2.5">
              {deals.map((d) => (
                <li key={d.offer_id}>
                  <DealRow deal={d} back={back} locked={!verified} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {(shop.description || shop.amenities.length > 0) && (
          <Section id="about-h" title="About">
            {shop.description && <p className="leading-relaxed whitespace-pre-line text-ink-700">{shop.description}</p>}
            {shop.amenities.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="What they offer">
                {shop.amenities.map((a) => (
                  <li key={a} className="rounded-full bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-800">
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {shop.branches.length > 0 && (
          <Section id="where-h" title={shop.branches.length > 1 ? "Branches" : "Location"}>
            <ul className="space-y-6">
              {shop.branches.map((b) => {
                const link = directionsUrl(b);
                const label = openLabel(b);
                return (
                  <li key={b.id}>
                    <div className="flex gap-3">
                      <MapPin className="mt-0.5 size-5 shrink-0 text-blue-600" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink-900">{b.name}</p>
                        {b.landmark && <p className="text-ink-800">{b.landmark}</p>}
                        <p className="text-[0.9375rem] text-ink-600">{[b.address, b.digital_address].filter(Boolean).join(" · ")}</p>
                        {label && (
                          <p className={cn("mt-1 text-[0.9375rem] font-semibold", label.open ? "text-emerald-700" : "text-ink-600")}>
                            {label.text}
                          </p>
                        )}
                        {link && (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold text-blue-700"
                          >
                            <Navigation className="size-4" aria-hidden /> Open in Google Maps
                          </a>
                        )}
                      </div>
                    </div>
                    {b.hours.length > 0 ? (
                      <table className="mt-3 ml-8 text-[0.9375rem]">
                        <caption className="sr-only">Opening hours at {b.name}</caption>
                        <tbody>
                          {DAYS.map((day, i) => {
                            const h = b.hours.find((x) => x.weekday === i + 1);
                            const today = shop.today === i + 1;
                            return (
                              <tr key={day} className={cn(today ? "font-bold text-ink-900" : "text-ink-700")}>
                                <th scope="row" className="py-0.5 pr-6 text-left font-[inherit]">
                                  {day}
                                  {today && <span className="ml-1.5 text-sm font-semibold text-blue-700">Today</span>}
                                </th>
                                <td className="py-0.5">{h ? `${h.opens}–${h.closes}` : "Closed"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      b.opening_hours && (
                        <p className="mt-2 ml-8 flex items-center gap-2 text-[0.9375rem] text-ink-700">
                          <Clock className="size-4" aria-hidden /> {b.opening_hours}
                        </p>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {(phone || shop.whatsapp || shop.email || shop.website) && (
          <Section id="contact-h" title="Contact">
            <ul className="space-y-1">
              {phone && (
                <li>
                  <a href={telUrl(phone)} className="inline-flex min-h-11 items-center gap-3 text-ink-800">
                    <Phone className="size-5 text-ink-500" aria-hidden /> {phone}
                  </a>
                </li>
              )}
              {shop.whatsapp && (
                <li>
                  <a
                    href={whatsappUrl(shop.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-3 text-ink-800"
                  >
                    <MessageCircle className="size-5 text-ink-500" aria-hidden /> WhatsApp {shop.whatsapp}
                  </a>
                </li>
              )}
              {shop.email && (
                <li>
                  <a href={`mailto:${shop.email}`} className="inline-flex min-h-11 items-center gap-3 break-all text-ink-800">
                    <Mail className="size-5 shrink-0 text-ink-500" aria-hidden /> {shop.email}
                  </a>
                </li>
              )}
              {shop.website && (
                <li>
                  <a
                    href={shop.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-3 break-all text-ink-800"
                  >
                    <Globe className="size-5 shrink-0 text-ink-500" aria-hidden /> {shop.website.replace(/^https:\/\//, "")}
                  </a>
                </li>
              )}
            </ul>
          </Section>
        )}

        {shop.payment_methods.length > 0 && (
          <Section id="pay-h" title="Ways to pay">
            <ul className="flex flex-wrap gap-2">
              {shop.payment_methods.map((p) => (
                <li
                  key={p}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-800"
                >
                  <Wallet className="size-4 text-ink-500" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {socials.length > 0 && (
          <Section id="social-h" title="Follow">
            <ul className="space-y-1">
              {socials.map((s) => (
                <li key={s.key}>
                  <a
                    href={s.url(shop.socials[s.key])}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-3 text-ink-800"
                  >
                    <AtSign className="size-5 text-ink-500" aria-hidden />
                    <span>
                      {s.label} <span className="text-ink-600">@{shop.socials[s.key]}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </AreaShell>
  );
}
