# Separating production from staging

Today the Vercel **Production** environment (`perqly-eta.vercel.app`) talks to the **staging** Supabase project (`perqly-staging`, ref `wktijbmvogxbbwwvqlhq`). That is fine while building, not for real students. Each step below is done by the owner; nothing here has been done yet.

Staging keeps its test accounts and data. Production starts empty.

## 1. Create the production Supabase project

- New project `perqly-production`, region London (`eu-west-2`, same as staging and the Vercel functions), a new strong database password kept only in the password manager.
- Free plan to start. Nightly backups come from GitHub Actions (`docs/BACKUPS.md`); upgrade to Pro before launch if you want Supabase's own daily backups and point-in-time recovery.
- **Auth** (Authentication → Sign In / Providers, URL Configuration, Emails):
  - Email sign-in with codes on, the same email templates as staging (they must contain `{{ .Token }}`).
  - Custom SMTP through Resend with the production sender.
  - Site URL and redirect URLs: the production address only, no localhost, no staging.
  - Google: a **new** OAuth client for the production address, or add the production callback to the existing client. Publish the Google app (out of Testing) before students sign up.
  - Multi-factor (TOTP) on.

## 2. Create the tables

- `npx supabase link --project-ref <production-ref>`, then `npx supabase db push`. Every migration applies in order to the empty database (0001 to 0024 today).
- **Don't run `supabase/seed.sql` on production.** It's for local development only. The migrations already add the categories and the 19 Accra institutions (including GCTU, its campuses and the official logos), all hidden until GTEC accreditation is recorded.
- Storage buckets are created by the migrations. Check in Storage that `verification-documents` and `pass-photos` are **private**, and `merchant-photos` and `institution-logos` are public.
- Check for warnings in Supabase (Advisors → Security and Performance). Callable functions and multiple-policy notices are expected (see the note at the end).
- Afterwards, `npx supabase link --project-ref wktijbmvogxbbwwvqlhq` again, so later `db push` commands go to staging until you mean otherwise.

## 3. Set Vercel variables (never reuse staging secrets)

| Variable                                                           | Production                        | Preview                 |
| ------------------------------------------------------------------ | --------------------------------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | production project                | staging project         |
| `SUPABASE_SECRET_KEY`                                              | new production secret key         | staging secret key      |
| `RESEND_API_KEY`                                                   | new key, production only          | staging key             |
| `RESEND_FROM_EMAIL`                                                | `Perqly <no-reply@<your domain>>` | staging sender          |
| `CRON_SECRET`                                                      | new random value (32+ characters) | none                    |
| `NEXT_PUBLIC_SITE_URL`                                             | the production address            | unset                   |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`                | keep the current pair (see below) | optional, separate pair |
| `VAPID_SUBJECT`                                                    | `mailto:` an address you read     | same                    |

Phone notification keys: keeping the current pair is fine, since each phone turns notifications on again once it signs in to production. Changing the pair later cuts off every phone, so pick once.

Rotate anything that ever appeared in chat: the Resend keys, `CRON_SECRET`, and the Google client secret.

## 4. Domain

- Add the Perqly domain to the Vercel project, verify DNS, make it the production domain.
- Verify the domain in Resend (SPF, DKIM) and switch the sender.
- Printed QR posters encode `NEXT_PUBLIC_SITE_URL`: print production posters only after the domain is final.

## 5. Accounts and data

- Sign up on production as yourself, then make the account super admin from the SQL editor (the only time SQL is used for this), and enrol two-factor.
- In Admin → Institutions, record GTEC accreditation for each school you open, then set it to Pilot.

## 6. Backups

Add the GitHub secrets for the **production** database (`docs/BACKUPS.md`). From then on the nightly backup covers production; staging doesn't need one.

## 7. Before opening to students

- Data Protection Commission registration filed.
- Run through the main flows on production with your own accounts: sign up, verify, redeem at a test business you then remove.
- Daily job: Vercel runs it on Production only; check the first run's log the next morning.
- A restore tried once into a scratch project (`docs/BACKUPS.md`).
- An incident contact written down: who to call if the site or database is down.

## Note on Supabase's warnings

Checked on 15 November 2026 against a full copy of the schema, using the same checks the Supabase dashboard runs:

- **Signed-in users can call security-definer functions** (98): intended. They are the app's own actions; each checks who is calling, and server-only functions are blocked for users.
- **Anonymous users can call a function** (1): `join_waitlist`, intended.
- **Multiple permissive policies** (26): a speed hint only. It matters at much larger scale.
- **Unused indexes** and **RLS on without policies** (`push_subscriptions`, reached only through functions): expected.
