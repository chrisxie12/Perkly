"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  BadgeCheck,
  BookOpen,
  Bell,
  Box,
  Building2,
  ChartColumn,
  Compass,
  GraduationCap,
  FileText,
  Heart,
  House,
  Inbox,
  Lock,
  MapPin,
  Menu,
  PenLine,
  PiggyBank,
  MessageCircle,
  Star,
  QrCode,
  Receipt,
  ScanLine,
  ScrollText,
  Settings,
  Shield,
  Store,
  Tag,
  Ticket,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { activeIn, type AreaNav, type IconName, type NavItem } from "@/lib/navigation/config";

const ICONS: Record<IconName, LucideIcon> = {
  home: House,
  compass: Compass,
  heart: Heart,
  qr: QrCode,
  user: User,
  tag: Tag,
  scan: ScanLine,
  chart: ChartColumn,
  store: Store,
  receipt: Receipt,
  users: Users,
  inbox: Inbox,
  shield: Shield,
  settings: Settings,
  building: Building2,
  file: FileText,
  scroll: ScrollText,
  bell: Bell,
  more: Menu,
  box: Box,
  map: MapPin,
  pen: PenLine,
  wallet: Wallet,
  piggy: PiggyBank,
  chat: MessageCircle,
  star: Star,
  badge: BadgeCheck,
  calendar: CalendarDays,
  book: BookOpen,
  ticket: Ticket,
  cap: GraduationCap,
};

function Badge({ badge }: { badge: NavItem["badge"] }) {
  if (badge === "dot") return <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-orange-500" aria-hidden />;
  if (badge === "lock") return <Lock className="absolute -top-0.5 -right-1 size-3 text-ink-600" aria-hidden />;
  return null;
}

function badgeText(badge: NavItem["badge"]) {
  return badge === "dot" ? ", needs attention" : badge === "lock" ? ", after verification" : "";
}

/** Desktop sidebar (icon rail on tablets). */
export function SideNav({ nav }: { nav: AreaNav }) {
  const pathname = usePathname();
  const items = nav.groups.flatMap((g) => g.items);
  const active = activeIn(items, pathname);
  return (
    <nav
      aria-label={`${nav.label} menu`}
      className="sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 overflow-y-auto border-r border-ink-200 bg-white py-4 md:block md:w-20 lg:w-64"
    >
      {nav.groups.map((group, gi) => (
        <div key={gi} className={cn(gi > 0 && "mt-4 border-t border-ink-100 pt-4")}>
          {group.label && <p className="mb-1 hidden px-5 text-xs font-semibold text-ink-600 lg:block">{group.label}</p>}
          <ul className="space-y-1 px-2 lg:px-3">
            {group.items.map((it) => {
              const Icon = ICONS[it.icon];
              const current = active === it.key;
              return (
                <li key={`${gi}-${it.key}`}>
                  <Link
                    href={it.href}
                    aria-current={current ? "page" : undefined}
                    title={it.label}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-medium text-ink-700 hover:bg-ink-100 lg:flex-row lg:gap-3 lg:px-3 lg:text-[0.9375rem]",
                      current && "bg-blue-50 font-semibold text-blue-700 hover:bg-blue-50",
                    )}
                  >
                    <span className="relative">
                      <Icon className="size-5" aria-hidden />
                      <Badge badge={it.badge} />
                    </span>
                    <span className="text-center lg:text-left">
                      {it.label}
                      <span className="sr-only">{badgeText(it.badge)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Phone bottom tabs: a floating liquid-glass capsule, at most five, with "More" for the rest.
 * The current tab sits in a tinted "lens"; the emphasised action (Scan) is a glossy orange button.
 */
export function BottomNav({ nav }: { nav: AreaNav }) {
  const pathname = usePathname();
  const active = activeIn([...nav.tabs, ...nav.more], pathname);
  const moreActive = nav.more.some((i) => i.key === active);
  if (nav.tabs.length < 2 && nav.more.length === 0) return null;
  return (
    <nav
      aria-label={`${nav.label} tabs`}
      className="glass pq-dock fixed inset-x-3 bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.375rem))] z-30 mx-auto max-w-md rounded-[2rem] px-1 md:hidden"
    >
      <ul className="grid h-16 auto-cols-fr grid-flow-col items-center">
        {nav.tabs.slice(0, nav.more.length > 0 ? 4 : 5).map((it) => {
          const Icon = ICONS[it.icon];
          const current = active === it.key;
          if (it.emphasis) {
            return (
              <li key={it.key} className="flex justify-center">
                <Link
                  href={it.href}
                  aria-current={current ? "page" : undefined}
                  aria-label={`${it.label}${badgeText(it.badge)}`}
                  className="gloss-orange theme-fixed relative grid size-12 place-items-center rounded-full text-ink-900 transition-transform duration-200 active:scale-90"
                >
                  <Icon className="size-6" strokeWidth={2.2} aria-hidden />
                  {it.badge === "lock" && (
                    <span
                      className="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-white shadow-sm"
                      aria-hidden
                    >
                      <Lock className="size-3 text-ink-700" />
                    </span>
                  )}
                  {it.badge === "dot" && <Badge badge={it.badge} />}
                </Link>
              </li>
            );
          }
          return (
            <li key={it.key} className="flex justify-center">
              <Link
                href={it.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative flex w-full flex-col items-center gap-0.5 text-[0.6875rem] font-medium text-ink-700 transition-colors duration-300 active:scale-95",
                  current && "font-semibold text-blue-600 dark:text-[#A78BFA]",
                )}
              >
                <span
                  className={cn(
                    "relative grid h-7 w-12 place-items-center rounded-full transition-colors duration-300",
                    current && "bg-blue-500/12",
                  )}
                >
                  <Icon
                    className={it.icon === "ticket" ? "size-5" : "size-[1.375rem]"}
                    // One outline weight for every tab; the active one is told apart by colour.
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <Badge badge={it.badge} />
                </span>
                <span className="max-w-full truncate px-0.5">
                  {it.label}
                  <span className="sr-only">{badgeText(it.badge)}</span>
                </span>
              </Link>
            </li>
          );
        })}
        {nav.more.length > 0 && (
          <li className="flex justify-center">
            <details className="group relative">
              <summary
                className={cn(
                  "flex cursor-pointer list-none flex-col items-center gap-0.5 text-[0.6875rem] font-medium text-ink-700 [&::-webkit-details-marker]:hidden",
                  moreActive && "font-semibold text-blue-600",
                )}
              >
                <span className={cn("grid h-7 w-12 place-items-center rounded-full", moreActive && "bg-blue-500/12")}>
                  <Menu className="size-[1.375rem]" strokeWidth={moreActive ? 2.4 : 1.9} aria-hidden />
                </span>
                More
              </summary>
              <ul className="glass absolute right-0 bottom-full mb-3 w-56 rounded-3xl p-2">
                {nav.more.map((it) => {
                  const Icon = ICONS[it.icon];
                  return (
                    <li key={it.key}>
                      <Link
                        href={it.href}
                        onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
                        aria-current={active === it.key ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[0.9375rem] font-medium text-ink-900 hover:bg-white/60",
                          active === it.key && "bg-blue-500/12 text-blue-700",
                        )}
                      >
                        <Icon className="size-5" aria-hidden /> {it.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          </li>
        )}
      </ul>
    </nav>
  );
}
