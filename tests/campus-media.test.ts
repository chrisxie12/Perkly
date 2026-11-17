import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
const { runCampusMediaCleanup } = await import("@/lib/jobs/campus-media");
const { signReturnedPaths } = await import("@/features/campus/posts/public");

type Call = { fn: string; args?: unknown };

function fakeAdmin(opts: { claims?: string[][]; claimError?: boolean; removeError?: boolean; hang?: boolean }) {
  const calls: Call[] = [];
  const buckets: string[] = [];
  const claims = [...(opts.claims ?? [])];
  const client = {
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ fn, args });
      if (opts.hang) await new Promise(() => {});
      if (fn === "queue_campus_media_orphans") return { data: 2, error: null };
      if (fn === "claim_campus_media_due")
        return opts.claimError ? { data: null, error: { message: "boom" } } : { data: claims.shift() ?? [], error: null };
      if (fn === "mark_campus_media_purged") return { data: (args as { p_paths: string[] }).p_paths.length, error: null };
      if (fn === "mark_campus_media_failed") return { data: null, error: null };
      if (fn === "clear_removed_campus_posts") return { data: 1, error: null };
      return { data: null, error: { message: "unexpected" } };
    },
    storage: {
      from: (bucket: string) => {
        buckets.push(bucket);
        return {
          remove: async (paths: string[]) =>
            opts.removeError ? { data: null, error: { message: "storage down" } } : { data: paths, error: null },
        };
      },
    },
  };
  return { client: () => client as unknown as SupabaseClient, calls, buckets };
}

describe("campus media clean-up", () => {
  it("queues orphans, removes due files, marks them, clears old removed posts", async () => {
    const f = fakeAdmin({ claims: [["a/b/post/c.jpg", "a/b/post/d.jpg"]] });
    const r = await runCampusMediaCleanup({ client: f.client });
    expect(r).toMatchObject({ queued: 2, removed: 2, failed: 0, cleared: 1 });
    expect(r.error).toBeUndefined();
    expect(f.buckets.every((b) => b === "campus-media")).toBe(true);
  });

  it("marks each file of a failed batch for retry and never throws", async () => {
    const f = fakeAdmin({ claims: [["a/b/post/c.jpg", "a/b/post/d.jpg"]], removeError: true });
    const r = await runCampusMediaCleanup({ client: f.client });
    expect(r.failed).toBe(2);
    expect(f.calls.filter((c) => c.fn === "mark_campus_media_failed")).toHaveLength(2);
    expect(f.calls.some((c) => c.fn === "mark_campus_media_purged")).toBe(false);
  });

  it("turns a database error into a result, not an exception", async () => {
    const f = fakeAdmin({ claimError: true });
    await expect(runCampusMediaCleanup({ client: f.client })).resolves.toMatchObject({
      error: expect.stringContaining("claim_campus_media_due"),
    });
  });

  it("turns a failure to even create the client into a result", async () => {
    const r = await runCampusMediaCleanup({
      client: () => {
        throw new Error("SUPABASE_SECRET_KEY is not set");
      },
    });
    expect(r.error).toContain("SUPABASE_SECRET_KEY");
  });

  it("stops by itself once its time is up", async () => {
    let t = 0;
    const f = fakeAdmin({ claims: [["a/b/post/c.jpg"], ["a/b/post/d.jpg"]] });
    const r = await runCampusMediaCleanup({ client: f.client, now: () => (t += 15_000) });
    expect(r.stoppedEarly).toBe(true);
  });

  it("never touches notifications or other buckets", () => {
    const source = readFileSync("src/lib/jobs/campus-media.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).not.toMatch(/notification/i);
    expect(source).not.toMatch(/dispatch/i);
    expect([...source.matchAll(/storage\.from\(([^)]*)\)/g)].map((m) => m[1])).toEqual(["BUCKET"]);
    expect(source).toMatch(/const BUCKET = "campus-media";/);
  });
});

describe("no Campus code triggers notification delivery", () => {
  it("nothing under src/features/campus imports the dispatcher", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const p = `${dir}/${name}`;
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    for (const file of walk("src/features/campus")) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/notifications\/dispatch|dispatchNotifications|deliverNotificationsSoon/);
    }
  });
});

describe("public post images", () => {
  it("signs exactly the paths the database returned, and nothing when there are none", async () => {
    const sign = vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `signed:${p}`])));
    expect((await signReturnedPaths([null, undefined, ""], sign)).size).toBe(0);
    expect(sign).not.toHaveBeenCalled();
    const out = await signReturnedPaths(["a/b/logo/c.png", "a/b/post/d.jpg", "a/b/post/d.jpg"], sign);
    expect(sign).toHaveBeenCalledWith(["a/b/logo/c.png", "a/b/post/d.jpg"]);
    expect([...out.keys()]).toEqual(["a/b/logo/c.png", "a/b/post/d.jpg"]);
  });
});
