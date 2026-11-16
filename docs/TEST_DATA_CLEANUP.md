# Removing test data from production

**How test accounts left over from building Perqly are found, reviewed and removed from the live database without touching real users or businesses.**

|         |                                                                                        |
| ------- | -------------------------------------------------------------------------------------- |
| Status  | **Procedure only. Nothing has been run.** Milestone 1, task 1.6                        |
| Updated | 2026-11-16                                                                             |
| Related | `docs/PRODUCTION_SEPARATION.md`, `docs/ACCOUNT_DELETION_RUNBOOK.md`, `docs/BACKUPS.md` |

## 1. Rules

1. **StudaData stays.** It is a genuine business. Its merchant account, branches, opening hours, QR codes, photos, services, products, offers, team, agreements, billing records, and every redemption, chat, rating and notification linked to it are excluded from the inventory and never changed.
2. **Nothing changes until you have reviewed the inventory** and approved, in writing, exactly which accounts and businesses are removed.
3. **When in doubt, it stays.** An account is only listed as test data for a clear reason (section 3). Anything uncertain is shown separately for you to decide.
4. **A backup is taken first,** immediately before the clean-up runs.
5. **Records that others rely on are anonymised, not deleted.** A completed redemption is also the business's record of a discount given, so it is kept and attached to an anonymous profile, the same way account deletion works.

## 2. Steps

| Step | What happens                                                                                                                                                                       | Who                    | Changes data?  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------- |
| 1    | You list the email addresses and business names you know you created for testing                                                                                                   | You                    | No             |
| 2    | Claude writes `scripts/db/production-test-data-inventory.sql`: read-only queries that list candidate accounts and every linked record (section 4), with StudaData excluded by name | Claude, after approval | No             |
| 3    | You run the inventory in the Supabase SQL editor for **production** and save the results; or share them with personal details removed                                              | You                    | No (read-only) |
| 4    | You mark each account and business: remove, keep, or ask                                                                                                                           | You                    | No             |
| 5    | Claude writes the clean-up script for the approved rows only, wrapped in one transaction, ending with before-and-after counts; you review it                                       | Claude, after approval | No             |
| 6    | Fresh backup (`docs/BACKUPS.md`), then you run the clean-up                                                                                                                        | You                    | **Yes**        |
| 7    | You re-run the inventory: removed rows are gone, StudaData's counts are unchanged                                                                                                  | You                    | No             |

## 3. What counts as a test account

Only these, and each candidate shows which reason applies:

- The email address is on your list from step 1.
- The business name or account name starts with `TEST`, or is on your list from step 1.
- The account belongs to a Perqly team member and was used only for trying flows, as confirmed by you.

Never on its own: a short name, no profile photo, no activity, or an unverified student. Real students look like that too.

## 4. What the inventory lists for each candidate

**For a candidate person**

| Area             | Tables                                                                                           | Clean-up action if approved                                      |
| ---------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Account          | `auth.users`, `profiles`                                                                         | Email replaced and account banned; profile cleared               |
| Student          | `student_profiles`, `student_verifications`; files in `verification-documents` and `pass-photos` | Deleted, files included                                          |
| Discounts        | `redemption_sessions`, `redemptions`, `student_savings`                                          | Kept, attached to an anonymous profile                           |
| Saved and social | `favourites`, `conversations`, `messages`, `merchant_reviews`                                    | Deleted (a rating left on a real business is shown to you first) |
| Notifications    | `notifications`, `notification_preferences`, `push_subscriptions`                                | Deleted                                                          |
| Roles            | `platform_staff`, `merchant_users`, `merchant_user_branches`, `institution_reviewers`            | Removed; never your own super admin account                      |
| Requests         | `account_deletion_requests`, `institution_requests`, `waitlist` entries with the same email      | Deleted                                                          |
| History          | `audit_logs`                                                                                     | Kept. The audit log is append-only by design                     |

**For a candidate business** (never StudaData)

`merchants`, `merchant_branches`, `merchant_branch_hours`, `merchant_qr_codes`, `merchant_photos` (and their files in `merchant-photos`), `services`, `products`, `offers`, `offer_branches`, `offer_institutions`, `merchant_agreements`, `merchant_billing`, `merchant_payments`, plus redemptions, chats and ratings at that business. Proposed action: suspend and anonymise the business; keep redemptions attached to it for the record.

The inventory also shows totals, so you can see at a glance how many real records would be touched (the goal is zero).

## 5. After the clean-up

- Check that sign-in no longer works for each removed account.
- Check StudaData's page, offers and Business screens still work.
- Record the date, the approved list and the counts in a private note. Don't commit personal details to the repository.
- From then on, testing happens on staging only, so this procedure should not be needed again. A monthly read-only check compares production accounts against the tester list.
