/** What a notification looks like as a phone notification and as an email. No server-only imports: unit tested. */

export type NotificationContent = {
  id: string;
  kind: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
};

export type PushPayload = { id: string; title: string; body: string; url: string; link: string; tag: string };

/** Only same-site paths are ever opened from a notification. */
export function safeNotificationPath(link: string | null | undefined): string {
  return link && /^\/[A-Za-z0-9/_?=&.-]*$/.test(link) && !link.startsWith("//") ? link : "/account/notifications";
}

export function buildPushPayload(n: NotificationContent): PushPayload {
  return {
    id: n.id,
    title: n.title.slice(0, 120),
    body: (n.body ?? "").slice(0, 240),
    // Tapping it marks it read, then opens what it's about.
    url: `/account/notifications/open/${n.id}`,
    // What it's about, so an open app can skip the pop-up when you're already there.
    link: safeNotificationPath(n.link),
    // One visible notification per thing: a newer one about the same kind replaces the older.
    tag: n.kind,
  };
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function buildNotificationEmail(n: NotificationContent, siteUrl: string) {
  const base = siteUrl.replace(/\/$/, "");
  const link = `${base}${safeNotificationPath(n.link)}`;
  const settings = `${base}/account/notifications/settings`;
  const subject = n.title;
  const text = [n.title, n.body ?? "", `Open Perqly: ${link}`, "", `Choose which emails you get: ${settings}`].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin: 0; padding: 24px; background: #f8fafc; font-family: Arial, Helvetica, sans-serif; color: #1f2937">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px">
      <tr>
        <td style="padding: 32px">
          <p style="margin: 0 0 24px; font-size: 22px; font-weight: bold; color: #0066ff">perqly</p>
          <p style="margin: 0 0 12px; font-size: 18px; font-weight: bold; line-height: 1.4">${escapeHtml(n.title)}</p>
          ${n.body ? `<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5">${escapeHtml(n.body)}</p>` : ""}
          <p style="margin: 24px 0 0"><a href="${escapeHtml(link)}" style="display: inline-block; padding: 12px 20px; border-radius: 999px; background: #0066ff; color: #ffffff; font-weight: bold; text-decoration: none">Open Perqly</a></p>
          <p style="margin: 24px 0 0; font-size: 13px; color: #6b7280"><a href="${escapeHtml(settings)}" style="color: #6b7280">Choose which emails you get</a></p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { subject, text, html };
}
