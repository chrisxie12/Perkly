import { z } from "zod";
import { REJECTION_REASONS } from "./status";

export const decisionNoticeSchema = z.object({
  email: z.email(),
  first_name: z.string().nullable(),
  status: z.enum(["approved", "rejected", "resubmission_requested"]),
  decision_reason: z.string().nullable(),
  reviewer_note: z.string().nullable(),
  institution_short_name: z.string(),
  verified_until: z.string().nullable(),
});

export type DecisionNotice = z.infer<typeof decisionNoticeSchema>;

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" });

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The email a student gets when a reviewer decides. It never names the
 * reviewer. The reviewer's note is included as plain, escaped text.
 */
export function buildDecisionEmail(notice: DecisionNotice, siteUrl: string) {
  const greeting = notice.first_name ? `Hi ${notice.first_name},` : "Hi,";
  const link = `${siteUrl.replace(/\/$/, "")}/student`;
  const school = notice.institution_short_name;

  let subject: string;
  let lines: string[];
  switch (notice.status) {
    case "approved":
      subject = "You're verified on Perqly";
      lines = [
        `Perqly has confirmed you're a ${school} student. Student offers appear in Perqly as businesses near your campus join.`,
        notice.verified_until ? `Your verification lasts until ${dateFormat.format(new Date(notice.verified_until))}.` : "",
      ];
      break;
    case "resubmission_requested":
      subject = "Your Perqly verification needs a change";
      lines = [
        "Your reviewer looked at your application and needs you to change something before deciding.",
        notice.reviewer_note ? `Their note: ${notice.reviewer_note}` : "",
        "Open Perqly to update your application and send it again.",
      ];
      break;
    case "rejected":
      subject = "Your Perqly verification wasn't approved";
      lines = [
        `We couldn't verify you as a ${school} student.`,
        notice.decision_reason ? (REJECTION_REASONS[notice.decision_reason] ?? "") : "",
        notice.reviewer_note ? `Their note: ${notice.reviewer_note}` : "",
        "If you think this is a mistake, reply to this email or apply again on Perqly with clearer photos.",
      ];
      break;
  }
  const body = lines.filter(Boolean);

  const text = [greeting, "", ...body.flatMap((line) => [line, ""]), `Open Perqly: ${link}`, "", "Perqly"].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin: 0; padding: 24px; background: #f8fafc; font-family: Arial, Helvetica, sans-serif; color: #1f2937">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px">
      <tr>
        <td style="padding: 32px">
          <p style="margin: 0 0 24px; font-size: 22px; font-weight: bold; color: #0066ff">perqly</p>
          <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5">${escapeHtml(greeting)}</p>
          ${body.map((line) => `<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5">${escapeHtml(line)}</p>`).join("\n          ")}
          <p style="margin: 24px 0 0"><a href="${escapeHtml(link)}" style="display: inline-block; padding: 12px 20px; border-radius: 999px; background: #0066ff; color: #ffffff; font-weight: bold; text-decoration: none">Open Perqly</a></p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
