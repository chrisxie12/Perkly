# Removing test data from production

**How test accounts left over from building Perqly are found, reviewed and removed from the live database without touching real users or businesses.**

|         |                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------- |
| Status  | **Procedure only. No inventory or clean-up script has been written or run.** Milestone 1, task 1.6 |
| Updated | 2026-11-16                                                                                         |
| Related | `docs/PRODUCTION_SEPARATION.md`, `docs/ACCOUNT_DELETION_RUNBOOK.md`, `docs/BACKUPS.md`             |

## 1. Rules

1. **StudaData stays, identified by its merchant ID.** StudaData is a genuine business. It is identified by its `merchants.id` (a UUID that never changes), not by its name, because names can be edited. Its ID isn't recorded in the repository yet. Step 2 finds it and you confirm it. Every script then:
   - stores the confirmed ID as a constant;
   - **stops before doing anything** if that ID doesn't exist, isn't approved, or doesn't belong to a business currently named StudaData;
   - excludes every row with that `merchant_id`: branches, opening hours, QR codes, photos and their files, services, products, offers and their branch and school links, team memberships, agreements, billing and payments, redemptions and redemption sessions, chats, ratings and favourites;
   - treats StudaData's team members (`merchant_users` rows for that ID) as genuine, and never lists them as candidates.
2. **Nothing changes until you've reviewed the inventory** and approved in writing exactly which accounts and businesses are removed, and how.
3. **When in doubt, it stays.** An account is listed as test data only for a clear reason (section 3). Anything uncertain goes in a separate "ask" list.
4. **Genuine records are found before anything is proposed.** The inventory flags every link between a candidate and a genuine user or business (section 5). A candidate with such links isn't removed in the usual way. It's shown to you to decide.
5. **A checked backup is taken first** (`docs/BACKUPS.md`, section 5).
6. **Claude writes scripts; Claude runs nothing.** You run the read-only inventory and, after approval, the clean-up. This document doesn't authorise running any script.

## 2. Steps

| Step | What happens                                                                                                                                                                                                               | Who                    | Changes data?  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------- |
| 1    | You list the email addresses and business names you know you created for testing                                                                                                                                           | You                    | No             |
| 2    | Claude writes `scripts/db/production-test-data-inventory.sql`. It is read-only: it opens a `read only` transaction and contains `select` statements only. Its first query shows StudaData's merchant ID for you to confirm | Claude, after approval | No             |
| 3    | You run it in the **production** SQL editor and keep the results privately. If you share them with Claude, remove names, emails and phone numbers first                                                                    | You                    | No (read-only) |
| 4    | You mark each candidate: keep, ban, anonymise, delete, or ask (section 4)                                                                                                                                                  | You                    | No             |
| 5    | Claude writes a clean-up script for the approved rows only. It is one transaction, starts with the StudaData check from rule 1, and ends with before-and-after counts. You review it                                       | Claude, after approval | No             |
| 6    | Fresh checked backup, then you run the clean-up. Storage files are removed separately, in the dashboard (section 6)                                                                                                        | You                    | **Yes**        |
| 7    | You re-run the inventory: approved rows are gone or anonymised, flagged rows are untouched, and every StudaData count matches step 3                                                                                       | You                    | No             |

## 3. What counts as a test account

Only these, and each candidate shows which reason applies:

- Its email address is on your step 1 list.
- Its business name, or the account's name, starts with `TEST`, or is on your step 1 list.
- It belongs to a Perqly team member and you confirm it was only used to try things out.

These alone never make an account a candidate: a short name, no photo, no activity, or an unverified student. Real students look like that too.

## 4. Ban, anonymise and delete are different

| Action        | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Reversible?           | Use when                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ban**       | Sets `auth.users.banned_until = 'infinity'`. The person can't sign in. Nothing else changes                                                                                                                                                                                                                                                                                                                                                                                                          | Yes                   | Only as part of anonymise. Alone, it leaves personal data in place                                                                                                                                                              |
| **Anonymise** | Clears personal details, keeps the rows. On `profiles`: name, first name, phone and avatar cleared; suspended. On `auth.users`: email replaced by `deleted+<id>@invalid.perqly`, phone and metadata cleared, banned. Google links (`auth.identities`) and sessions removed. Student profile and verification applications deleted. Favourites, notifications, preferences and push subscriptions deleted. Memberships set to removed. This is the same as `docs/ACCOUNT_DELETION_RUNBOOK.md`, step 4 | No, for personal data | The account has records others rely on, such as completed redemptions                                                                                                                                                           |
| **Delete**    | Removes the `auth.users` row. The database then deletes the profile and everything set to delete with it (section 5)                                                                                                                                                                                                                                                                                                                                                                                 | No                    | Only if the account has **no** rows in the "blocks deletion" list in section 5. Done through the Supabase dashboard (Authentication → Users → Delete user) after the database script, so Supabase Auth cleans up its own tables |

For a candidate **business** (never StudaData): **suspend and anonymise**. Set `merchants.status` to `suspended`, clear its contact details, set its offers to `archived` and revoke its QR codes (`revoked`). Remove it entirely only if it has no redemptions, redemption sessions or payments.

## 5. What the inventory lists for each candidate

### 5.1 For a candidate person

Rows that **cascade** with the profile, so deleting the person deletes them too:

`student_profiles` → `student_verifications`, `student_savings`, `favourites`, `redemption_sessions` (as student), `notifications`, `notification_preferences`, `push_subscriptions`, `conversations` (as student) → their `messages`, `merchant_reviews` (as author), `merchant_users`, `merchant_user_branches`, `institution_reviewers`, `platform_staff`, `account_deletion_requests`, `institution_requests` (as requester).

Rows that **block deletion**. The foreign key has no delete rule, so the database refuses to delete the person while these exist:

| Table                       | Column(s)                                                                 |
| --------------------------- | ------------------------------------------------------------------------- |
| `redemptions`               | `student_id`, `merchant_confirmed_by`, `payment_recorded_by`, `voided_by` |
| `redemption_sessions`       | `merchant_confirmed_by`, `rejected_by`                                    |
| `merchants`                 | `created_by`                                                              |
| `offers`                    | `created_by`                                                              |
| `merchant_qr_codes`         | `issued_by`, `revoked_by`                                                 |
| `merchant_agreements`       | `signer_id`                                                               |
| `account_deletion_requests` | `handled_by`                                                              |

Rows **set to null** on deletion, so the record stays without the person: `platform_staff.granted_by`, `institution_reviewers.appointed_by`, `student_verifications.decided_by`, `merchants.approved_by`, `merchant_users.invited_by`, `merchant_photos.created_by`, `merchant_payments.created_by`, `institution_requests.handled_by`, `messages.sender_id`, `merchant_reviews.hidden_by`.

Not linked by a foreign key, but matched by email: `waitlist`.

Storage files:

| Bucket                   | Files belonging to a person            |
| ------------------------ | -------------------------------------- |
| `pass-photos`            | `<user id>/pass.*`                     |
| `verification-documents` | `<user id>/<application id>/…`         |
| any bucket               | objects whose `owner_id` is the person |

The `audit_logs` rows where the person is the actor (`actor_id`) or the subject (`entity_id`) are also listed. Section 7 explains why they stay.

### 5.2 For a candidate business (never StudaData)

Rows that cascade with the business: `merchant_branches` → `merchant_branch_hours`, `merchant_qr_codes`, `offer_branches`, `merchant_user_branches`; `merchant_users`, `services`, `products`, `offers` → `offer_branches`, `offer_institutions`; `favourites`, `merchant_agreements`, `merchant_photos`, `merchant_billing`, `merchant_payments`, `conversations` → `messages`, `merchant_reviews`.

Rows that **block deletion**: `redemptions` and `redemption_sessions` (through `merchant_id`, `branch_id` and `offer_id`).

Storage files: everything in `merchant-photos/<merchant id>/`.

### 5.3 Links to genuine records (flagged, never removed automatically)

For each candidate, the inventory shows any row that links it to a person or business **not** on the candidate list. For example:

- a redemption, chat or rating at StudaData or another genuine business;
- a genuine student's redemption confirmed by a candidate account (`merchant_confirmed_by`);
- a genuine business, offer or QR code created or issued by a candidate (`created_by`, `issued_by`);
- a candidate who is a member of a genuine business's team, or who approved one (`approved_by`);
- a candidate who holds a platform staff role or reviews for a school.

A flagged candidate goes on the "ask" list with these links shown. Usually the answer is to anonymise rather than delete, so the genuine record keeps a valid link. **Your own super admin account is never a candidate.**

### 5.4 Totals

The inventory ends with totals per table: candidate rows, flagged rows, and StudaData rows. StudaData's totals are recorded so step 7 can show they didn't change.

## 6. Storage files

The database tables and the files are separate. Deleting a row in SQL doesn't delete the file it points to, and deleting rows from `storage.objects` in SQL is not a reliable way to delete files.

- The inventory lists matching files by bucket and path (section 5).
- After the database clean-up, you delete the approved files in the Supabase dashboard (Storage → bucket → folder) or through the Storage API. Claude doesn't.
- Files under `merchant-photos/<StudaData's ID>/` are never listed.
- Files in `institution-logos` belong to schools, not people, and are out of scope.

## 7. How completed redemptions and audit records keep their integrity

- **Completed redemptions are never deleted or edited.** They are the business's and Perqly's record of a discount given. For an anonymised student, `redemptions.student_id` still points at the same profile, now anonymised, so the link stays valid. The business, branch and offer it points at are suspended, archived or revoked, not deleted, because `redemptions` blocks their deletion. Totals and reports stay correct.
- **Redemption sessions** stay for the same reason. Unfinished ones expire on their own.
- **The audit log is append-only by design.** A trigger refuses any update, deletion or truncation of `audit_logs`, and the clean-up doesn't try. `actor_id` and `entity_id` have no foreign keys, so audit rows stay valid as historical IDs after a person is anonymised or deleted.
- **A known limit:** some audit rows hold before-and-after snapshots in `before` and `after`, which can include names. Those can't be cleared without changing the append-only design. That is a decision for the pre-launch privacy work, pending the legal entity, and isn't made here.
- **The clean-up records itself.** The clean-up script writes one audit entry per removed or anonymised account or business, through `private.write_audit` (for example `account.test_data_removed`). The entry holds the ID and the action, not the person's details.

## 8. After the clean-up

- Check that sign-in no longer works for each removed or anonymised account.
- Check StudaData's page, offers, QR codes and Business screens still work, and that its counts match step 3.
- Record the date, the approved list and the counts in a private note. Don't commit personal details to the repository.
- From then on, all testing happens on staging. A monthly read-only check compares production accounts against your tester list.
