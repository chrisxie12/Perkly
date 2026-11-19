import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const deferred: (() => unknown)[] = [];

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    deferred.push(fn);
  },
}));
vi.mock("@/lib/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/env.server", () => ({ getServerEnv: () => ({ CRON_SECRET: "s", SUPABASE_SECRET_KEY: "k" }) }));
vi.mock("@/lib/jobs/cron-auth", () => ({ isAuthorisedCronRequest: (h: string | null) => h === "Bearer s" }));
vi.mock("@/lib/jobs/verification-retention", () => ({
  purgeVerificationDocuments: async () => ({ removed: 0, failed: 0 }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string) => {
      order.push(fn);
      return { data: 0, error: null };
    },
  }),
}));
const dispatch = vi.fn(async (limit: number) => {
  order.push(`dispatch:${limit}`);
  return { delivered: 0 };
});
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotifications: dispatch }));
const cleanup = vi.fn(async () => {
  order.push("campus");
  return { queued: 0, removed: 0, failed: 0, cleared: 0 };
});
vi.mock("@/lib/jobs/campus-media", () => ({ runCampusMediaCleanup: cleanup }));
const stale = vi.fn(async () => {
  order.push("bookings");
  return { closed: 0 };
});
vi.mock("@/lib/jobs/stale-bookings", () => ({ runCloseStaleBookings: stale }));
const reminders = vi.fn(async () => {
  order.push("reminders");
  return { queued: 0 };
});
vi.mock("@/lib/jobs/event-reminders", () => ({ runEventReminders: reminders }));

const { GET } = await import("@/app/api/cron/daily/route");
const { NextRequest } = await import("next/server");
const call = (auth = "Bearer s") => GET(new NextRequest("https://x.test/api/cron/daily", { headers: { authorization: auth } }));

beforeEach(() => {
  order.length = 0;
  deferred.length = 0;
  dispatch.mockClear();
  cleanup.mockClear();
  stale.mockClear();
  reminders.mockClear();
});

describe("daily cron with Campus", () => {
  it("dispatches once with 500, and Campus runs only after the response", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(500);
    expect(cleanup).not.toHaveBeenCalled();
    expect(stale).not.toHaveBeenCalled();
    expect(reminders).not.toHaveBeenCalled();
    expect(order).not.toContain("campus");
    expect(Object.keys(await res.json()).sort()).toEqual(
      ["billing", "documents", "expired", "notificationsDelivered", "offersEnded", "reminders", "sessionsExpired"].sort(),
    );

    await Promise.all(deferred.map((fn) => fn()));
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(stale).toHaveBeenCalledTimes(1);
    expect(reminders).toHaveBeenCalledTimes(1);
    expect(order.indexOf("dispatch:500")).toBeLessThan(order.indexOf("reminders"));
    expect(order.indexOf("dispatch:500")).toBeLessThan(order.indexOf("bookings"));
    expect(order.indexOf("dispatch:500")).toBeLessThan(order.indexOf("campus"));
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("schedules nothing for an unauthorised call", async () => {
    const res = await call("Bearer wrong");
    expect(res.status).toBe(401);
    expect(deferred).toHaveLength(0);
  });
});
