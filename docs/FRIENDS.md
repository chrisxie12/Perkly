# Friends

Status: built 20 Nov 2026, live once released. Founder decisions (19 Nov 2026): find classmates **by name only**, **off by
default**, and friends can see each other's deal activity, share deals, see who's going to events and chat.

## What students can do

- **Find classmates**: Me → Friends → search by name. Results are only verified students at the **same school** who turned
  on **Let classmates find me**. Results show name, programme and level. Never the ID photo, selfie, pass photo or email.
- **Friend requests**: the other student accepts or declines. Sending a request back to someone who asked you accepts it.
  Either side can remove the friendship.
- **Activity** (only from friends who turned on **Show my activity to friends**): on a deal page, friends who used the deal
  or saved the shop; on a Campus event, friends who are going.
- **Share a deal**: "Send to a friend" on a deal page, with an optional note (140 characters). The friend gets a
  notification and sees it under Deals friends sent you.
- **Chat**: friends message each other (Friends → message button). Live updates, same as shop chat, on separate tables.
- **Block and report**: blocking ends the friendship, hides both students from each other's search, closes chats and hides
  shared deals. Reports go to Perqly support (Admin → Activity → Student reports, two-factor), with the last 50 messages
  of the chat if the report came from one. The reported student is not told who reported them.

Both settings are off until the student turns them on. Only verified students can use Friends (`/student/friends*` route
rule and every database function).

## Notifications

`friend.request`, `friend.accepted`, `friend.share` → the new **Friends** category in notification settings.
`friendchat.message` → **Messages**. `review.student_report` → support staff (**Things to review**).

## Database

Migration `20261120090000_friends.sql`: `student_social_settings`, `friendships` (one row per pair, smaller id first),
`student_blocks`, `deal_shares`, `friend_chats`, `friend_messages`, `student_reports`. Row security on every table; only
`friend_messages` can be read directly (by the two people in the chat, for live updates). Everything else goes through
security-definer functions. Rate limits: 30 requests a day, 30 shares an hour, 20 messages a minute, 10 reports a day.
Deleting an account deletes its friendships, settings, shares and chats; reports keep the text but lose the name.

Tests: `supabase/tests/031_friends_test.sql`, `tests/friends.test.ts`.

## Before real students

- The privacy notice must describe Friends: what classmates can see (name, programme, level), the two settings, chat,
  reports and how long messages are kept. The Data Protection Commission registration should list it too.
- Decide how long friend chat messages are kept (they are kept until either account is deleted today).
