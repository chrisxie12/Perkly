import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotifications: async () => ({ delivered: 0 }) }));
const { runAccountMediaCleanup, groupByBucket } = await import("@/lib/jobs/account-media");

type Row = { bucket: string; path: string };
type Call = { fn: string; args?: unknown };

function fakeAdmin(opts: { claims?: Row[][]; reminded?: number; claimError?: boolean; failBucket?: string }) {
  const calls: Call[] = [];
  const removed: { bucket: string; paths: string[] }[] = [];
  const claims = [...(opts.claims ?? [])];
  const client = {
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ fn, args });
      if (fn === "remind_overdue_account_deletions") return { data: opts.reminded ?? 0, error: null };
      if (fn === "claim_account_media_due")
        return opts.claimError ? { data: null, error: { message: "boom" } } : { data: claims.shift() ?? [], error: null };
      if (fn === "mark_account_media_purged") return { data: (args as { p_paths: string[] }).p_paths.length, error: null };
      if (fn === "mark_account_media_failed") return { data: null, error: null };
      return { data: null, error: { message: "unexpected" } };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          if (bucket === opts.failBucket) return { data: null, error: { message: "storage down" } };
          removed.push({ bucket, paths });
          return { data: paths, error: null };
        },
      }),
    },
  };
  return { client: () => client as unknown as SupabaseClient, calls, removed };
}

const rows: Row[] = [
  { bucket: "pass-photos", path: "u/pass.webp" },
  { bucket: "chat-photos", path: "shop/c/u/a.webp" },
  { bucket: "chat-photos", path: "shop/c/m/b.webp" },
  { bucket: "verification-documents", path: "u/app/card.webp" },
];

describe("account media clean-up", () => {
  it("removes each queued file from its own bucket and marks it", async () => {
    const f = fakeAdmin({ claims: [rows] });
    const r = await runAccountMediaCleanup({ client: f.client, dispatch: async () => undefined });
    expect(r).toMatchObject({ removed: 4, failed: 0 });
    expect(r.error).toBeUndefined();
    expect(f.removed).toEqual([
      { bucket: "pass-photos", paths: ["u/pass.webp"] },
      { bucket: "chat-photos", paths: ["shop/c/u/a.webp", "shop/c/m/b.webp"] },
      { bucket: "verification-documents", paths: ["u/app/card.webp"] },
    ]);
  });

  it("retries only the bucket that failed", async () => {
    const f = fakeAdmin({ claims: [rows], failBucket: "chat-photos" });
    const r = await runAccountMediaCleanup({ client: f.client, dispatch: async () => undefined });
    expect(r).toMatchObject({ removed: 2, failed: 2 });
    expect(f.calls.filter((c) => c.fn === "mark_account_media_failed")).toHaveLength(2);
  });

  it("sends reminders straight away when some are due", async () => {
    const dispatch = vi.fn(async () => undefined);
    const f = fakeAdmin({ reminded: 1 });
    const r = await runAccountMediaCleanup({ client: f.client, dispatch });
    expect(r.reminded).toBe(1);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("does not dispatch when nothing is due", async () => {
    const dispatch = vi.fn(async () => undefined);
    await runAccountMediaCleanup({ client: fakeAdmin({}).client, dispatch });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("turns a database error into a result, not an exception", async () => {
    const f = fakeAdmin({ claimError: true });
    await expect(runAccountMediaCleanup({ client: f.client, dispatch: async () => undefined })).resolves.toMatchObject({
      error: expect.stringContaining("claim_account_media_due"),
    });
  });

  it("ignores malformed rows", () => {
    expect(groupByBucket([{ bucket: "pass-photos", path: "a" }, null as unknown as Row])).toEqual(new Map([["pass-photos", ["a"]]]));
  });
});
