# Separating production from staging

Today the Vercel **Production** environment (`perqly-eta.vercel.app`) talks to the **staging** Supabase project (`perqly-staging`, ref `wktijbmvogxbbwwvqlhq`). That is fine for the pilot build, not for real students. Nothing below has been done; each step needs the owner's approval.

## 1. Create the production Supabase project

- New project `perqly-production`, region `eu-west-1` (same as staging), a new strong database password kept in the owner's password manager.
- Enable the Pro plan before launch if daily backups and point-in-time recovery are needed.
- Auth: email OTP on; SMTP via Resend with the production sender; the same email templates (they must contain `{{ .Token }}`); site URL and redirect URLs set to the production domain only.
- Two-factor (TOTP) on.

## 2. Apply the schema

- `npx supabase link --project-ref <production-ref>` then `npx supabase db push`. All migrations 0001–0010 apply in order to an empty database.
- Run `supabase/seed.sql` **only** for the GCTU institution row and categories, not test data.
- Storage bucket `verification-documents` is created by migration 0004; check it's private.
- Run the Supabase security and performance advisors and fix anything new.

## 3. Rotate and set secrets (never reuse staging values)

| Variable                                                           | Production                                                    | Preview                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | production project                                            | staging project                                    |
| `SUPABASE_SECRET_KEY`                                              | new production secret key                                     | staging secret key (currently missing for Preview) |
| `RESEND_API_KEY`                                                   | new key, production-only                                      | staging key                                        |
| `RESEND_FROM_EMAIL`                                                | `Perqly <no-reply@perqly.online>` once the domain is verified | staging sender                                     |
| `CRON_SECRET`                                                      | new random value                                              | none                                               |
| `NEXT_PUBLIC_SITE_URL`                                             | `https://perqly.online`                                       | unset                                              |

Rotate the Resend keys and `CRON_SECRET` that appeared in chat during setup.

## 4. Domain

- Add `perqly.online` to the Vercel project, verify DNS, set it as the production domain.
- Verify `perqly.online` in Resend (SPF, DKIM) and switch the sender.
- Printed QR posters encode `NEXT_PUBLIC_SITE_URL`: print production posters only after the domain is final.

## 5. Accounts and data

- Create the super admin on production and enrol two-factor.
- Recreate GCTU's reviewers on production. Staging test accounts and data stay on staging.

## 6. Before opening to students

- Run the acceptance tests in each spec on production with a fictional institution, then remove it.
- Turn on Vercel cron for production only.
- Confirm backups and an incident contact.
