/**
 * Account deletion wording shared by the admin screen, the confirmation email
 * and the public /delete-account page. What it says must match what
 * admin_complete_account_deletion actually does
 * (supabase/migrations/20261125090000_account_deletion.sql). Change them together.
 */

export const DELETION_DEADLINE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** Days left before the 30-day deadline: negative once it has passed. */
export function deletionDaysLeft(requestedAt: string, now: number = Date.now()): number {
  const due = new Date(requestedAt).getTime() + DELETION_DEADLINE_DAYS * DAY;
  return Math.ceil((due - now) / DAY);
}

export function deletionDueDate(requestedAt: string): Date {
  return new Date(new Date(requestedAt).getTime() + DELETION_DEADLINE_DAYS * DAY);
}

export const DELETED_ITEMS = [
  "your name, phone number and pass photo",
  "your student record, verification applications and their ID and selfie photos",
  "your chats with businesses, including photos sent by either side",
  "your ratings, saved businesses, friends and Campus comments, likes and RSVPs",
  "your notifications and the devices that get them",
] as const;

export const KEPT_ITEMS = [
  "a record of the discounts you used and bookings you made, without your name, because it's the business's and Perqly's record",
  "Campus event tickets already scanned at the door, without your name",
] as const;

const BLOCKERS: Record<string, string> = {
  platform_staff: "They are Perqly staff. Remove their staff role first.",
  business_owner: "They own a business on Perqly. The business needs a new owner, or must be closed, first.",
  last_club_owner: "They are the only owner of a Campus club. Another member must be made owner first.",
};

export function deletionBlockerText(details: string | null | undefined): string {
  const codes = (details ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const lines = codes.map((c) => BLOCKERS[c]).filter(Boolean);
  return lines.length > 0 ? `Not deleted yet. ${lines.join(" ")}` : "Not deleted yet. Something has to be handed over first.";
}

export function blockerLabel(code: string): string {
  return BLOCKERS[code] ?? "Something has to be handed over first.";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function buildDeletionConfirmationEmail(siteUrl: string) {
  const base = siteUrl.replace(/\/$/, "");
  const page = `${base}/delete-account`;
  const subject = "Your Perqly account has been deleted";
  const intro = "As you asked, your Perqly account has been deleted. You can no longer sign in with it.";
  const backups = "Perqly's encrypted backups are kept for 14 days, so deleted data can remain in a backup for up to 14 days.";
  const text = [
    intro,
    "",
    "Deleted:",
    ...DELETED_ITEMS.map((i) => `- ${i}`),
    "",
    "Kept:",
    ...KEPT_ITEMS.map((i) => `- ${i}`),
    "",
    backups,
    "",
    `More about deletion: ${page}`,
    "You're welcome back any time with a new account.",
  ].join("\n");
  const list = (items: readonly string[]) =>
    `<ul style="margin: 0 0 16px; padding-left: 20px; font-size: 15px; line-height: 1.5">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
  const html = `<!doctype html>
<html lang="en">
  <body style="margin: 0; padding: 24px; background: #f8fafc; font-family: Arial, Helvetica, sans-serif; color: #1f2937">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px">
      <tr>
        <td style="padding: 32px">
          <p style="margin: 0 0 24px; font-size: 22px; font-weight: bold; color: #6d28d9">perqly</p>
          <p style="margin: 0 0 12px; font-size: 18px; font-weight: bold; line-height: 1.4">${escapeHtml(subject)}</p>
          <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5">${escapeHtml(intro)}</p>
          <p style="margin: 0 0 4px; font-size: 15px; font-weight: bold">Deleted</p>
          ${list(DELETED_ITEMS)}
          <p style="margin: 0 0 4px; font-size: 15px; font-weight: bold">Kept</p>
          ${list(KEPT_ITEMS)}
          <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5">${escapeHtml(backups)}</p>
          <p style="margin: 24px 0 0; font-size: 13px; color: #6b7280"><a href="${escapeHtml(page)}" style="color: #6b7280">More about deletion</a></p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { subject, text, html };
}
