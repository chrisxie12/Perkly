# Perqly

**Student benefits. Real campus value.**

> **Name:** the product is **Perqly**. The GitHub repository is still named `Perkly` and will be renamed later; the npm package name (`perkly`) and Supabase local `project_id` follow the repo name until then.

Perqly is a student-exclusive discounts and benefits platform for Ghanaian tertiary students. Verified students get real discounts at food spots, print shops and services around campus; merchants pay to reach them. The pilot launches first at **Ghana Communication Technology University (GCTU)**, and the architecture supports many institutions.

Perqly is **one installable Progressive Web App**. There are no native Android or iOS apps. Students, merchants, institution reviewers and Perqly staff all use the same web app.

**Specifications.** Phase 1 is specified in [`docs/`](./docs):

| Document                                                                                | Covers                                                                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`PERQLY_PRODUCT_SPECIFICATION.md`](./docs/PERQLY_PRODUCT_SPECIFICATION.md)             | Vision, confirmed decisions, features by role, conflicts, open decisions |
| [`PERQLY_DATABASE_ARCHITECTURE.md`](./docs/PERQLY_DATABASE_ARCHITECTURE.md)             | Tables, RLS, database functions, migrations                              |
| [`PERQLY_USER_FLOWS.md`](./docs/PERQLY_USER_FLOWS.md)                                   | Screen-by-screen flows for every role                                    |
| [`PERQLY_QR_REDEMPTION_SPECIFICATION.md`](./docs/PERQLY_QR_REDEMPTION_SPECIFICATION.md) | QR codes, redemption sessions, security controls                         |
| [`PERQLY_IMPLEMENTATION_ROADMAP.md`](./docs/PERQLY_IMPLEMENTATION_ROADMAP.md)           | Build order, dependencies, acceptance criteria                           |

The earlier product and technical plan (<https://claude.ai/artifact/GaKkF97JCKtAc1XJFENVEL>) still covers revenue, compliance and later phases. Where it disagrees with `docs/`, the documents in `docs/` win.

---

## Current status: Phase 0, Step 1

| Area                                                                                    | Status                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Next.js foundation, TypeScript strict, Tailwind v4, ESLint, Prettier, Vitest, CI        | Done                                                         |
| Design system (tokens, fonts, core components, `/design` reference page)                | Done                                                         |
| Public landing page, `/install`, draft `/privacy` and `/terms`                          | Done                                                         |
| PWA baseline: manifest, icons, Serwist service worker, offline page, update prompt      | Done (device install tests pending, see `PWA_TESTING.md`)    |
| Supabase browser/server clients, session refresh in `proxy.ts`, env validation          | Done; no Supabase project connected yet                      |
| `/student`, `/merchant`, `/institution`, `/admin`                                       | "Coming soon" shells only, with no data and no fake features |
| Authentication, verification, offers, bookings, redemption, dashboards, database schema | Specified in `docs/`; not started                            |

---

## Tech stack

| Layer      | Choice                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack, Cache Components), React 19, TypeScript strict            |
| Styling    | Tailwind CSS v4 with Perqly design tokens in `src/app/globals.css`                           |
| Components | shadcn-style components (Radix primitives + `class-variance-authority`), Lucide icons        |
| Fonts      | Bricolage Grotesque (display) and Figtree (body), self-hosted from `src/app/fonts` (SIL OFL) |
| Backend    | Supabase (Postgres, Auth, Storage, RLS) via `@supabase/ssr`                                  |
| Validation | Zod                                                                                          |
| PWA        | Serwist (`@serwist/turbopack`), web app manifest, service worker                             |
| Hosting    | Vercel                                                                                       |
| Tests      | Vitest (unit), headless Chrome checks (see `PWA_TESTING.md`)                                 |

> shadcn/ui note: the shadcn CLI couldn't reach its registry from the build environment, so the components in `src/components/ui` were written by hand in the shadcn pattern (Radix + CVA + `cn`). You can add more later with `npx shadcn@latest add <component>`.

---

## Architecture overview

- **One app, four areas.** `/student`, `/merchant`, `/institution` and `/admin` are real URL segments, so each can have its own layout and server-side role guard. Public marketing pages live in the `(marketing)` route group.
- **Security boundary = the database.** The browser only ever holds the Supabase **publishable** key. Row Level Security plus server-side checks decide access. Redirects in `proxy.ts` are a convenience, never the security boundary.
- **Session refresh** happens in `src/proxy.ts` (Next.js 16 renamed `middleware.ts` to `proxy.ts`). It uses `getClaims()`, which validates the JWT.
- **Static by default.** Every Phase 0 page is prerendered. Cache Components is on, so anything time-based or per-request must be explicit.
- **Service worker rules** (`src/app/sw.ts`): cross-origin requests (Supabase), non-GET requests and everything under `/student`, `/merchant`, `/institution`, `/admin`, `/api`, `/auth`, `/login`, `/register` are **NetworkOnly**, never cached. Offline, they show `/offline`. Public pages and static assets use Serwist's defaults.

## Folder structure

```
src/
  app/
    (marketing)/          landing page, /install, /privacy, /terms
    student/              shell ("coming soon")
    merchant/             shell
    institution/          shell
    admin/                shell
    offline/              offline fallback page
    design/               design system reference (noindex)
    serwist/[path]/       route that builds and serves the service worker
    fonts/                self-hosted woff2 fonts + licences
    sw.ts                 service worker source
    manifest.ts           web app manifest (/manifest.webmanifest)
    layout.tsx            root layout, metadata, viewport, SerwistProvider
    globals.css           design tokens
  components/
    ui/                   Button, Input, Card, Badge, Avatar, Dialog, Sheet, Accordion, Skeleton
    layout/               header, footer, mobile CTA bar, containers, shells
    marketing/            landing page sections
    shared/               Logo, empty/error/loading states, update prompt
  features/               module folders for later phases (auth, students, merchants, …)
  hooks/                  useTickingClock
  lib/
    supabase/             client.ts (browser), server.ts (server), proxy.ts (session refresh)
    env.ts                Zod-validated public env
    day-colour.ts         live-pass colour of the day
    utils.ts              cn()
  config/site.ts          name, description, nav
  proxy.ts                Next.js proxy (session refresh)
supabase/                 Supabase CLI project (migrations empty until Phase 1)
public/icons/             PWA + Apple icons (generated, see `npm run icons`)
scripts/generate-icons.mjs
tests/                    Vitest unit tests
.github/workflows/ci.yml  typecheck, lint, format, tests, build
```

---

## Local development

Requirements: **Node.js 20.9+** (22 recommended) and npm. Docker is needed only to run Supabase locally.

```bash
git clone https://github.com/chrisxie12/Perkly.git
cd Perkly
npm install
cp .env.example .env.local   # then fill in the values, see below
npm run dev                  # http://localhost:3000
```

The public site runs **without** Supabase configured. Supabase is only needed once authentication arrives.

### Commands

| Command                           | What it does                                                           |
| --------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                     | Development server (service worker disabled in dev)                    |
| `npm run dev:https`               | Dev server over HTTPS with a local certificate                         |
| `npm run build`                   | Production build                                                       |
| `npm run start`                   | Serve the production build (service worker active)                     |
| `npm run typecheck`               | Generates route types, then type-checks the app and the service worker |
| `npm run lint`                    | ESLint                                                                 |
| `npm run test`                    | Vitest unit tests                                                      |
| `npm run format` / `format:check` | Prettier (with Tailwind class sorting)                                 |
| `npm run icons`                   | Regenerates PWA icons from the logo geometry                           |
| `npm run check`                   | typecheck + lint + test + build                                        |

## Environment variables

| Variable                               | Where it's used   | Notes                                                                                                            |
| -------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser + server  | Supabase → Project Settings → API                                                                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server  | The **publishable** key (`sb_publishable_…`) or the legacy anon key. `src/lib/env.ts` rejects a secret key here. |
| `NEXT_PUBLIC_SITE_URL`                 | Metadata, sitemap | e.g. `https://perqly.vercel.app`                                                                                 |

- Never commit `.env.local`; it's in `.gitignore`.
- **Never** put a secret or service-role key in a `NEXT_PUBLIC_` variable. None is needed in Phase 0. When one is needed (webhooks, cron), it goes in a server-only variable read only from modules marked `import "server-only"`.

## Supabase setup

1. Create **two** Supabase projects on the free plan: `perqly-staging` and `perqly-production`.
2. Copy each project's URL and publishable key into `.env.local` (staging) and the Vercel environment variables (production).
3. Local development (optional): install the [Supabase CLI](https://supabase.com/docs/guides/local-development) and run `supabase start`, then use the local URL and key it prints.
4. Migrations live in `supabase/migrations/` and are applied with the CLI. **It's empty in Phase 0**; the schema arrives in Phase 1 together with RLS policies and pgTAP tests.
5. Free-plan caveats: projects pause after 7 days of low activity, and there are no automatic backups. Plan a nightly `pg_dump` before the pilot (see the plan).

Status: the Supabase clients are implemented and type-checked, but **no Supabase project has been connected or tested yet**.

## PWA

- Manifest: `/manifest.webmanifest` (from `src/app/manifest.ts`), `display: standalone`, `start_url: /student`.
- Icons: 192, 512, maskable 512, Apple touch icon 180 and an SVG favicon (`public/icons`, generated by `npm run icons`).
- Service worker: `src/app/sw.ts`, built and served at `/serwist/sw.js` by `src/app/serwist/[path]/route.ts`. It's registered by `SerwistProvider` in production only, and served with `Cache-Control: no-store`.
- Updates: a new version waits instead of taking over open tabs. Users see "A new version of Perqly is ready" and choose when to refresh.
- Offline: `/offline` is precached. Private areas are never cached. Redemption will always require a connection.

### Installing on a phone

Service workers need HTTPS. Use a Vercel preview deployment (simplest), or run `npm run build && npm run start` behind an HTTPS tunnel.

- **Android (Chrome):** open the site → ⋮ menu → _Install app_.
- **iPhone (Safari):** open the site → Share → _Add to Home Screen_ → open from the Home Screen icon. Web push on iPhone needs iOS 16.4+ and only works from the installed app.

Test procedures and results are in [`PWA_TESTING.md`](./PWA_TESTING.md).

## Deployment (Vercel)

1. Import `chrisxie12/Perkly` in Vercel (framework preset: Next.js).
2. Add the environment variables above for Preview and Production.
3. Every push to a branch gets a preview URL; `main` deploys to production.
4. Note: Vercel's **Hobby plan is for non-commercial use only**. It's fine for building and private testing; decide on the hosting plan before the public pilot (see the plan's open questions).

## Security notes

- Only the publishable key is exposed to the browser; RLS is the security boundary.
- `server-only` guards the server Supabase client.
- Security headers on every route: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera and geolocation allowed for this site only, for scanning merchant QR codes later), and a partial CSP (`frame-ancestors`, `base-uri`, `object-src`, `form-action`). A full nonce-based CSP comes with authentication.
- The service worker never caches cross-origin, non-GET or private-area requests.
- No authentication or authorization is faked. The `/student`, `/merchant`, `/institution` and `/admin` pages are honest placeholders.
- Landing page content rules: example offers use invented, labelled merchants; no GCTU logo or endorsement wording; no made-up traction numbers.

## Design system

Tokens are in `src/app/globals.css`, and every component is shown on `/design`.

| Token       | Value     | Rule                                                                                                    |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------- |
| Perqly Blue | `#0066FF` | White text on it ≈ 4.8:1 (AA)                                                                           |
| Perk Orange | `#FF6B35` | Use **ink** text on it (≈ 5.2:1). White on orange ≈ 2.8:1, so never use it. Never orange text on white. |
| Ink         | `#1F2937` | Body text, dark sections                                                                                |
| Paper       | `#F8FAFC` | Page background                                                                                         |
| White       | `#FFFFFF` | Cards                                                                                                   |

Live-pass "colour of the day" (Sun→Sat): `#7C3AED`, `#0066FF`, `#FF6B35`, `#15803D`, `#F5B800`, `#C2185B`, `#0E9F9F`. Each is paired with a text colour that passes AA (enforced by `tests/day-colour.test.ts`).

## Upcoming steps

Phase 1 (student marketplace, merchant bookings and QR redemption) is planned step by step in [`docs/PERQLY_IMPLEMENTATION_ROADMAP.md`](./docs/PERQLY_IMPLEMENTATION_ROADMAP.md). It replaces the earlier list of Phase 0 steps 2–6. Implementation starts only after the specifications are approved.
