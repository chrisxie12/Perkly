"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Pages, not people: drop search terms and record ids, so /student/offers/<id> counts as one page. */
function scrub(url: string) {
  const u = new URL(url);
  u.search = "";
  u.hash = "";
  u.pathname = u.pathname.replace(UUID, "[id]").replace(/\/r\/[^/]+/, "/r/[code]");
  return u.toString();
}

/** Vercel Web Analytics and Speed Insights: cookieless, no personal data. */
export function SiteAnalytics() {
  return (
    <>
      <Analytics beforeSend={(event: BeforeSendEvent) => ({ ...event, url: scrub(event.url) })} />
      <SpeedInsights beforeSend={(event) => ({ ...event, url: scrub(event.url) })} />
    </>
  );
}
