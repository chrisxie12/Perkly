# Account deletion runbook

Deletion must be done **within 30 days of the request**. This promise is on `/delete-account`, the account page and in the confirmation email, so it has to hold.

## How a request arrives

- **In the app:** Your account → Delete your account. The request is created at once.
- **By email** to the legal contact address. Only act on emails sent **from the account's own address**. Find the account in Admin → Users, open **They emailed to ask for deletion** and record when and from which address they wrote. This starts the same 30 days.

Every Perqly admin gets a notification (push and email, if they've turned them on) when a request arrives. If a request is still open after **20 days**, the daily job sends every admin one reminder.

## Doing it

You need to be a Perqly admin signed in with two-step verification.

1. Go to **Admin → Users → Deletion requests**. Requests are oldest first, with the days left or **Overdue**.
2. Read what will be deleted and kept. If the person still wants their data, they can download it themselves (Your account → Download my data) before you go ahead.
3. If a red line says something must be handed over first, sort that out (below), then come back.
4. Type **DELETE**, keep or change the note (for example "Asked in the app" or "Emailed on 3 Dec from their address"), and choose **Delete account**.
5. The confirmation email is sent automatically. If the screen says it couldn't be sent, email the address it shows from the support inbox straight away. That is the only time you'll see it.

To refuse a request (for example, it didn't come from the account's address), use **Don't delete** with the reason, and reply to the person.

## What stops a deletion

| Shown as                          | What to do                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| They are Perqly staff             | Remove their staff role first.                                                                       |
| They own a business               | Contact them: the business needs a new owner (another team member made owner), or it must be closed. |
| They are the only owner of a club | Another member must be made owner, or a Perqly admin archives the club.                              |

Contact them about it well within the 30 days.

## What it does

`public.admin_complete_account_deletion` (migration `20261125090000_account_deletion.sql`) runs everything in one transaction, so it either all happens or nothing does.

| Data                                                                               | What happens                                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Name, first name, phone, pass photo (`profiles`)                                   | Cleared. The row stays, marked deleted and suspended, and can't be refilled |
| Sign-in (`auth.users`)                                                             | Unusable email, banned; identities, sessions and second factors deleted     |
| Student profile, verification applications                                         | Deleted                                                                     |
| Shop chats (both sides, with photos), friend chats, reactions, chat settings       | Deleted                                                                     |
| Friends, blocks, shared deals, social settings                                     | Deleted                                                                     |
| Ratings, saved businesses, savings totals                                          | Deleted                                                                     |
| Campus follows, likes, saves, comments, RSVPs, unused tickets                      | Deleted; club memberships removed                                           |
| Push devices, notification settings, notifications                                 | Deleted                                                                     |
| Business team and school reviewer roles (not ownership)                            | Removed                                                                     |
| Reports and problem reports they made                                              | Kept for moderators, without who made them                                  |
| Redemptions, redemption sessions, bookings (student note cleared), scanned tickets | Kept, attached to the empty profile                                         |
| Campus posts they wrote                                                            | Kept with their club                                                        |
| Audit log                                                                          | Kept. The deletion entry holds counts only, no email or name                |
| Files: pass photo, ID card and selfie, chat photos                                 | Queued in `account_media_purge`; the daily job removes them from Storage    |

Backups are kept for 14 days, so deleted data can remain in a backup that long.

## Checking the files are gone

The daily job retries a file up to 7 times. To see anything stuck (SQL editor):

```sql
select bucket, path, attempts, last_error from public.account_media_purge
where purged_at is null order by created_at;
```

A file with `attempts = 7` needs removing by hand in Storage, then:

```sql
update public.account_media_purge set purged_at = now() where bucket = '<bucket>' and path = '<path>';
```

## Not part of this

Marking a request "completed" without running the deletion is no longer possible: `resolve_account_deletion` only declines now.
