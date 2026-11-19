# Campus pilot at GCTU (C6): runbook

Status: **not started.** This is the order of work for opening Campus to GCTU students. Nothing here has been done yet. Each step is done by a person; the app has no shortcut that skips one.

Related: `docs/CAMPUS.md` (what Campus does), `docs/BACKUPS.md` (restore rehearsal), the decision record https://claude.ai/artifact/EbKzyuRcfgvTKFiT1LD4Vp.

## 1. Before anything is merged

| Item                                                                                                  | Owner   | Status                                                               |
| ----------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| Gate 0: staging and production connection secrets correct; nightly backup re-enabled and passing      | Founder | Done 18 Nov 2026                                                     |
| Gate 0: read-only count of the production notification backlog                                        | Founder | Done 18 Nov 2026: 31 rows, none waiting                              |
| Gate 0: restore rehearsal passes (`docs/BACKUPS.md` §7)                                               | Founder | Passed 18–19 Nov 2026, except items 6–7 (sign-in on a restored copy) |
| Founder decides whether the Campus merge waits for the restore rehearsal, as the Gate 0 rule says now | Founder | Done: merged 19 Nov 2026 (PR #8), switched off                       |

## 2. Before real students see Campus

These come from the existing pre-launch list in the project plan and apply to Campus too.

- Registration with the Data Protection Commission (required before processing personal data). Campus adds posts, comments, follows, RSVPs and reports about students.
- The legal entity that operates Perqly is **pending**. Don't name one in notices, agreements or posts until it's decided.
- GCTU is listed in Perqly only once GTEC accreditation is recorded by an admin (enforced in the database).
- Never say or imply that GCTU partners with or endorses Perqly unless a signed agreement says so.

## 3. Organisations to start with

Start small: the GCTU SRC and one faculty, as planned. Both are created by a Perqly admin with two-factor; there's no self-registration.

1. **Admin → Campus organisations → New organisation**: GCTU, kind "SRC", name and address as the SRC uses them. Then the faculty.
2. Verify each one only after confirming, outside the app, that the person who'll own it really holds that role (for example, a letter or email from the SRC's official address). Record where that proof is kept.
3. Appoint each organisation's first owner by the email they use on Perqly. They then add their own editors.
4. **University official badge:** only for the school's administration, and only while an agreement with GCTU is recorded under **Admin → Campus switches and agreements**. With no agreement, don't create an administration organisation; the database refuses it anyway.

## 4. Switching on

All three switches are on **Admin → Campus switches and agreements**, super admins only, and each change is audited.

1. **Campus** on. Verified GCTU students now see their school's live organisations and posts. (Every listed school's students would see their own school's organisations; with only GCTU organisations created, only GCTU has content.)
2. Leave **Comments** off for the first weeks. Turn it on once moderation has a named person checking **Admin → Campus moderation** daily.
3. Leave **Phone and email notifications** off at first. Campus notifications then appear only in the app. Turn it on after the first week if posting volume looks reasonable; students can turn Campus off in their notification settings.

## 5. During the pilot

- Check the moderation queue daily. Reports, hidden comments and removed posts are audited.
- Limits (Admin → Settings): posts per organisation per day (10), comments per student per hour (30), reports per person per day (20).
- The daily job removes images 30 days after their post is removed, and sends event reminders the day before.

## 6. Stopping

Switch **Campus** off. Students and organisers immediately see "Campus isn't open yet" and public links show nothing. Nothing is deleted, so it can be switched on again. To remove one organisation, archive it: its posts are removed and their images deleted 30 days later.

## 7. What to look at after four weeks

Write the numbers down from the database or the admin pages, without guessing:

- organisations live, posts published, students following at least one organisation;
- events posted and RSVPs, and how many RSVPs were reminded;
- reports received, and how many led to a post or comment being removed;
- any problem a student or organiser raised with Perqly support.
