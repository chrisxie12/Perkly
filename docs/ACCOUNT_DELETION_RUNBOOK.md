# Account deletion runbook

People ask to delete their account from **Your account → Delete your account**. The request appears for Perqly admins under **Admin → Users → Deletion requests**. Deletion is done by a person, not automatically, because completed redemptions must stay as the business's and Perqly's record of discounts given.

## What is removed and what is kept

| Data                                         | Action                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Name, first name, phone, avatar (`profiles`) | Cleared                                                                                                                          |
| Student profile, verification applications   | Deleted once documents are gone (see step 3)                                                                                     |
| Saved businesses, notifications              | Deleted                                                                                                                          |
| Business memberships                         | Removed (`status = 'removed'`). An **owner** must hand the business to someone else first, or the business is suspended          |
| Redemptions, redemption sessions             | Kept, now attached to an anonymous profile                                                                                       |
| Audit log                                    | Kept (append-only)                                                                                                               |
| Sign-in (`auth.users`)                       | Email replaced with an unusable address and the user banned, so the profile row (and the redemptions that reference it) can stay |

## Steps

Run these in the Supabase SQL editor for the right project, as one transaction, replacing `:uid`.

1. **Check the request.** Confirm the request is open and the person isn't Perqly staff or a business owner.
   ```sql
   select * from public.account_deletion_requests where user_id = ':uid' and status = 'open';
   select role from public.platform_staff where user_id = ':uid';
   select merchant_id, role, status from public.merchant_users where user_id = ':uid';
   ```
2. **Offer an export first** if they haven't downloaded their data (Your account → Download my data).
3. **Verification documents.** If any application has photos not yet deleted (`documents_deleted_at is null` and a decision), wait for the daily job or delete the files in Storage (`verification-documents/<uid>/…`) first.
4. **Anonymise.**
   ```sql
   begin;
   update public.profiles set full_name = null, first_name = null, phone = null, avatar_path = null,
          is_suspended = true, suspended_reason = 'Account deleted at the user''s request' where id = ':uid';
   delete from public.favourites where student_id = ':uid';
   delete from public.notifications where user_id = ':uid';
   update public.merchant_users set status = 'removed', removed_at = now() where user_id = ':uid' and role <> 'owner';
   delete from public.student_profiles where user_id = ':uid'; -- also deletes verification applications
   update auth.users set email = 'deleted+' || id || '@invalid.perqly', phone = null, raw_user_meta_data = '{}'::jsonb,
          banned_until = 'infinity' where id = ':uid';
   delete from auth.identities where user_id = ':uid';
   delete from auth.sessions where user_id = ':uid';
   commit;
   ```
   Redemption sessions and redemptions reference `profiles` and `institutions`, not the student profile, so they stay.
5. **Record the outcome** in Admin → Users with what was done. This writes `account.deletion_completed` to the audit log.
6. **Email the person** from the support inbox to confirm.

### Campus (once migrations `20261117090000` and `20261118100000` are applied)

- Deleting or anonymising a profile: Campus follows, likes, saves, comments, event RSVPs and organisation memberships go with it (cascade). Posts the person wrote stay with their organisation, `author_id` set to null. Reports they made stay with `reporter_id` set to null.
- Before step 4, check they aren't the **last owner** of an organisation: `select organisation_id from public.organisation_members where user_id = ':uid' and role = 'owner';` Appoint another owner first, or ask a Perqly admin to archive it.
- Images they uploaded belong to the organisation, not the person, and stay until the post or organisation is removed.

### Bookings and problem reports (once migrations `20261118110000` and `20261118130000` are applied)

- A student's bookings are deleted with the account (cascade).
- Problem reports stay for Perqly support, without the person (`opened_by` set to null).

Target: within 30 days of the request.
