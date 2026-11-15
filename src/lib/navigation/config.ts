/**
 * Role-based navigation and route access, in one place.
 *
 * The same rules build every menu and decide, on the server, whether the
 * signed-in user may open a page (AreaShell checks every page load). Area-level
 * access (signed in, two-factor, suspended) stays in decideAccess/AreaGuard;
 * the database (RLS and functions) remains the security boundary.
 */
import { administeredInstitutions, canManagePlatform, canSupport, type MerchantMembership, type UserContext } from "@/lib/auth/roles";
import type { VerificationView } from "@/features/students/status";

export type NavArea = "student" | "merchant" | "institution" | "admin" | "account";

export type IconName =
  | "home"
  | "compass"
  | "heart"
  | "qr"
  | "user"
  | "tag"
  | "scan"
  | "chart"
  | "store"
  | "receipt"
  | "users"
  | "inbox"
  | "shield"
  | "settings"
  | "building"
  | "file"
  | "scroll"
  | "bell"
  | "more"
  | "box"
  | "map"
  | "pen"
  | "piggy"
  | "badge"
  | "wallet";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: IconName;
  /** Paths that count as inside this item. A trailing "*" matches the prefix; otherwise the path must be equal. */
  match: string[];
  badge?: "dot" | "lock";
  /** Drawn as the raised round button in the middle of the phone tab bar. */
  emphasis?: boolean;
};

export type NavGroup = { label: string | null; items: NavItem[] };
export type AreaNav = { area: NavArea; label: string; groups: NavGroup[]; tabs: NavItem[]; more: NavItem[] };

/** What the server knows about the user, from the database. */
export type NavContext = {
  ctx: UserContext;
  verification?: VerificationView | null;
  membership?: MerchantMembership | null;
};

export const AREA_TITLE: Record<NavArea, string> = {
  student: "Student",
  merchant: "Business",
  institution: "Institution",
  admin: "Perqly staff",
  account: "Account",
};

const item = (key: string, label: string, href: string, icon: IconName, match: string[] = [href], badge?: NavItem["badge"]): NavItem => ({
  key,
  label,
  href,
  icon,
  match,
  badge,
});

// Rules -------------------------------------------------------------------------------
type Rule = { path: string; allow: (n: NavContext) => boolean; reason: string };

const isManager = (n: NavContext) => n.membership?.role === "owner" || n.membership?.role === "manager";
const isLive = (n: NavContext) => n.membership?.status === "approved";
const hasMembership = (n: NavContext) => Boolean(n.membership);

/** Sub-page permissions inside each area, longest match wins. Paths not listed are open to everyone in the area. */
export const ROUTE_RULES: Rule[] = [
  // Business
  { path: "/merchant/offers*", allow: isManager, reason: "Only owners and managers manage offers." },
  { path: "/merchant/catalogue*", allow: isManager, reason: "Only owners and managers manage the catalogue." },
  { path: "/merchant/counter*", allow: (n) => hasMembership(n) && isLive(n), reason: "The counter opens once your business is live." },
  { path: "/merchant/redemptions*", allow: (n) => hasMembership(n) && isLive(n), reason: "Redemptions appear once your business is live." },
  {
    path: "/merchant/analytics*",
    allow: (n) => isManager(n) && isLive(n),
    reason: "Analytics are for owners and managers of a live business.",
  },
  { path: "/merchant/codes*", allow: (n) => isManager(n) && isLive(n), reason: "QR codes are for owners and managers of a live business." },
  { path: "/merchant/business*", allow: isManager, reason: "Only owners and managers manage the business." },
  { path: "/merchant/profile*", allow: isManager, reason: "Only owners and managers edit the business profile." },
  { path: "/merchant/branches*", allow: isManager, reason: "Only owners and managers manage branches." },
  { path: "/merchant/team*", allow: isManager, reason: "Only owners and managers manage the team." },
  { path: "/merchant/agreement*", allow: isManager, reason: "Only owners and managers can open the agreement." },
  // Institution
  {
    path: "/institution/reviewers*",
    allow: (n) => administeredInstitutions(n.ctx).length > 0,
    reason: "Only institution admins manage reviewers.",
  },
  // Perqly staff
  { path: "/admin/institutions/new*", allow: (n) => canManagePlatform(n.ctx), reason: "Only Perqly admins add institutions." },
  { path: "/admin/users*", allow: (n) => canSupport(n.ctx), reason: "Only Perqly support and admins look up accounts." },
  { path: "/admin/redemptions*", allow: (n) => canSupport(n.ctx), reason: "Only Perqly support and admins see redemptions." },
  { path: "/admin/reports*", allow: (n) => canSupport(n.ctx), reason: "Only Perqly support and admins see reports." },
  { path: "/admin/staff*", allow: (n) => canManagePlatform(n.ctx), reason: "Only Perqly admins see staff." },
  { path: "/admin/audit*", allow: (n) => canManagePlatform(n.ctx), reason: "Only Perqly admins read the audit log." },
  { path: "/admin/settings*", allow: (n) => canManagePlatform(n.ctx), reason: "Only Perqly admins see platform settings." },
];

function matches(pattern: string, path: string) {
  if (pattern.endsWith("*")) {
    const base = pattern.slice(0, -1);
    return path === base || path.startsWith(`${base}/`);
  }
  return path === pattern;
}

function normalise(path: string) {
  const clean = path.split(/[?#]/)[0] || "/";
  return clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
}

export type RouteDecision = { kind: "allow" } | { kind: "forbidden"; reason: string };

/** Whether a user may open a page inside an area they already have access to. */
export function routeAccess(path: string, n: NavContext): RouteDecision {
  const p = normalise(path);
  const rule = ROUTE_RULES.filter((r) => matches(r.path, p)).sort((a, b) => b.path.length - a.path.length)[0];
  if (!rule || rule.allow(n)) return { kind: "allow" };
  return { kind: "forbidden", reason: rule.reason };
}

// Menus -------------------------------------------------------------------------------
function studentNav(n: NavContext): AreaNav {
  const view = n.verification ?? null;
  const verified = view === "verified";
  const needsAction = view !== null && ["needs_profile", "apply", "resubmit", "rejected", "expired"].includes(view);
  const scan = {
    ...item("scan", "Scan", "/student/scan", "scan", ["/student/scan*", "/student/redeem*"], verified ? undefined : "lock"),
    emphasis: true,
  };
  const tabs = [
    item("deals", "Deals", "/student", "tag", ["/student", "/student/offers*", "/student/merchants*"]),
    item("saved", "Saved", "/student/favourites", "heart", ["/student/favourites*"]),
    scan,
    item("savings", "Savings", "/student/history", "piggy", ["/student/history*"]),
    item("me", "Me", "/student/me", "user", ["/student/me*", "/student/profile*", "/student/verify*"], needsAction ? "dot" : undefined),
  ];
  return {
    area: "student",
    label: AREA_TITLE.student,
    tabs,
    more: [],
    groups: [
      { label: null, items: tabs },
      {
        label: "You",
        items: [
          item("details", "School details", "/student/profile", "building", ["/student/profile*"]),
          item("verify", "Verification", "/student/verify", "badge", ["/student/verify*"]),
        ],
      },
    ],
  };
}

function merchantNav(n: NavContext): AreaNav {
  const overview = item("overview", "Overview", "/merchant", "home", ["/merchant"]);
  if (!n.membership)
    return { area: "merchant", label: AREA_TITLE.merchant, tabs: [overview], more: [], groups: [{ label: null, items: [overview] }] };
  const manage = isManager(n);
  const live = isLive(n);
  const offers = item("offers", "Offers", "/merchant/offers", "tag", ["/merchant/offers*", "/merchant/catalogue*"]);
  const scan = item(
    "scan",
    "Scan",
    "/merchant/counter",
    "scan",
    manage ? ["/merchant/counter*", "/merchant/redemptions*"] : ["/merchant/counter*"],
  );
  const history = item("history", "History", "/merchant/redemptions", "receipt", ["/merchant/redemptions*"]);
  const analytics = item("analytics", "Analytics", "/merchant/analytics", "chart", ["/merchant/analytics*"]);
  const business = item("business", "Business", "/merchant/business", "store", [
    "/merchant/business*",
    "/merchant/profile*",
    "/merchant/branches*",
    "/merchant/team*",
    "/merchant/codes*",
    "/merchant/agreement*",
    "/merchant/billing*",
  ]);

  const tabs = manage ? [overview, offers, ...(live ? [scan, analytics] : []), business] : [overview, ...(live ? [scan, history] : [])];

  const groups: NavGroup[] = [{ label: null, items: [overview, ...(live ? [scan] : []), ...(live && !manage ? [history] : [])] }];
  if (manage) {
    groups.push({
      label: "Sell",
      items: [offers, item("catalogue", "Catalogue", "/merchant/catalogue", "box", ["/merchant/catalogue*"])],
    });
    if (live) {
      groups.push({
        label: "Insights",
        items: [analytics, item("redemptions", "Redemptions", "/merchant/redemptions", "receipt", ["/merchant/redemptions*"])],
      });
    }
    groups.push({
      label: "Business",
      items: [
        item("profile", "Shop page", "/merchant/profile", "store", ["/merchant/profile*"]),
        item("branches", "Branches", "/merchant/branches", "map", ["/merchant/branches*"]),
        ...(live ? [item("codes", "QR codes", "/merchant/codes", "qr", ["/merchant/codes*"])] : []),
        item("team", "Team", "/merchant/team", "users", ["/merchant/team*"]),
        item("agreement", "Agreement", "/merchant/agreement", "pen", ["/merchant/agreement*"]),
        item("billing", "Billing", "/merchant/billing", "wallet", ["/merchant/billing*"]),
      ],
    });
  }
  return { area: "merchant", label: AREA_TITLE.merchant, tabs, more: [], groups };
}

function institutionNav(n: NavContext): AreaNav {
  const tabs = [
    item("overview", "Overview", "/institution", "home", ["/institution"]),
    item("students", "Students", "/institution/students", "users", ["/institution/students*"]),
    item("reviews", "Reviews", "/institution/reviews", "inbox", [
      "/institution/reviews*",
      "/institution/activity*",
      "/institution/requests*",
    ]),
    ...(administeredInstitutions(n.ctx).length > 0
      ? [item("reviewers", "Reviewers", "/institution/reviewers", "shield", ["/institution/reviewers*"])]
      : []),
    item("settings", "Settings", "/institution/settings", "settings", ["/institution/settings*"]),
  ];
  return {
    area: "institution",
    label: AREA_TITLE.institution,
    tabs,
    more: [],
    groups: [
      { label: null, items: tabs.slice(0, 1) },
      { label: "Verification", items: tabs.filter((t) => ["students", "reviews", "reviewers"].includes(t.key)) },
      { label: null, items: tabs.filter((t) => t.key === "settings") },
    ],
  };
}

function adminNav(n: NavContext): AreaNav {
  const support = canSupport(n.ctx);
  const admin = canManagePlatform(n.ctx);
  const overview = item("overview", "Overview", "/admin", "home", ["/admin"]);
  const institutions = item("institutions", "Institutions", "/admin/institutions", "building", ["/admin/institutions*"]);
  const merchants = item("merchants", "Merchants", "/admin/merchants", "store", ["/admin/merchants*"]);
  const offers = item("offers", "Offers", "/admin/offers", "tag", ["/admin/offers*"]);
  const users = item("users", "Users", "/admin/users", "users", ["/admin/users*"]);
  const staff = item("staff", "Staff", "/admin/staff", "shield", ["/admin/staff*"]);
  const redemptions = item("redemptions", "Redemptions", "/admin/redemptions", "receipt", ["/admin/redemptions*"]);
  const reports = item("reports", "Reports", "/admin/reports", "chart", ["/admin/reports*"]);
  const audit = item("audit", "Audit logs", "/admin/audit", "scroll", ["/admin/audit*"]);
  const settings = item("settings", "Settings", "/admin/settings", "settings", ["/admin/settings*"]);
  // Perqly admins verify students for any school (D16); the review queue lives in the school area.
  const reviews = item("reviews", "Student reviews", "/institution/reviews", "inbox", ["/institution/reviews*"]);
  const canReview = n.ctx.delegatedInstitutions.length > 0;

  const groups: NavGroup[] = [
    { label: null, items: [overview] },
    { label: "Partners", items: [...(canReview ? [reviews] : []), institutions, merchants, offers] },
    { label: "People", items: [...(support ? [users] : []), ...(admin ? [staff] : [])] },
    { label: "Activity", items: [...(support ? [redemptions, reports] : []), ...(admin ? [audit] : [])] },
    { label: null, items: admin ? [settings] : [] },
  ].filter((g) => g.items.length > 0);

  const all = groups.flatMap((g) => g.items);
  // What a solo operator checks most: reviews first, then businesses and their deals.
  const preferred = ["overview", "reviews", "merchants", "offers", "users", "institutions", "redemptions"];
  const primary = preferred.map((k) => all.find((i) => i.key === k)).filter((i): i is NavItem => Boolean(i));
  const fits = all.length <= 5;
  const tabs = fits ? all : primary.slice(0, 4);
  const more = fits ? [] : all.filter((i) => !tabs.includes(i));
  return { area: "admin", label: AREA_TITLE.admin, groups, tabs, more };
}

/** Where "Home" goes from the account pages: the area the person mainly uses. */
export function homeAreaFor(ctx: UserContext): Exclude<NavArea, "account"> {
  if (ctx.platformRole) return "admin";
  if (ctx.merchantRoles.length > 0 || ctx.signupIntent === "merchant") return "merchant";
  if (ctx.institutionRoles.length > 0) return "institution";
  return "student";
}

const HOME: Record<Exclude<NavArea, "account">, { label: string; href: string; icon: IconName }> = {
  student: { label: "Deals", href: "/student", icon: "tag" },
  merchant: { label: "Business", href: "/merchant", icon: "store" },
  institution: { label: "School", href: "/institution", icon: "building" },
  admin: { label: "Staff", href: "/admin", icon: "home" },
};

function accountNav(n: NavContext): AreaNav {
  const home = HOME[homeAreaFor(n.ctx)];
  const tabs = [
    // Never highlighted here: it leaves the account pages.
    item("home", home.label, home.href, home.icon, []),
    item("account", "Account", "/account", "user", ["/account"]),
    item("notifications", "Notifications", "/account/notifications", "bell", ["/account/notifications*"]),
  ];
  return { area: "account", label: AREA_TITLE.account, tabs, more: [], groups: [{ label: null, items: tabs }] };
}

export function navFor(area: NavArea, n: NavContext): AreaNav {
  switch (area) {
    case "student":
      return studentNav(n);
    case "merchant":
      return merchantNav(n);
    case "institution":
      return institutionNav(n);
    case "admin":
      return adminNav(n);
    case "account":
      return accountNav(n);
  }
}

/** The item among `items` that a path belongs to: the most specific match. Exact matches beat prefixes. */
export function activeIn(items: NavItem[], path: string): string | null {
  const p = normalise(path);
  let best: { key: string; score: number } | null = null;
  for (const it of items) {
    for (const m of it.match) {
      if (matches(m, p)) {
        const score = m.endsWith("*") ? m.length - 1 : m.length + 1000;
        if (!best || score > best.score) best = { key: it.key, score };
      }
    }
  }
  return best?.key ?? null;
}

/** Every destination a menu can link to, for checking that each has a page. */
export function allHrefs(nav: AreaNav) {
  return [...new Set([...nav.tabs, ...nav.more, ...nav.groups.flatMap((g) => g.items)].map((i) => i.href))];
}
