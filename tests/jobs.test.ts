import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAuthorisedCronRequest } from "@/lib/jobs/cron-auth";

vi.mock("server-only", () => ({}));
const { purgeVerificationDocuments } = await import("@/lib/jobs/verification-retention");

const SECRET = "s".repeat(40);

describe("cron authorisation", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorisedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorisedCronRequest(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorisedCronRequest(SECRET, SECRET)).toBe(false);
    expect(isAuthorisedCronRequest(null, SECRET)).toBe(false);
  });

  it("refuses everything when the secret is missing or too short", () => {
    expect(isAuthorisedCronRequest("Bearer ", undefined)).toBe(false);
    expect(isAuthorisedCronRequest("Bearer short", "short")).toBe(false);
  });
});

type Call = { fn: string; args: unknown };

function fakeAdmin(options: {
  due: { application_id: string; student_id: string; institution_id: string }[];
  files: Record<string, string[]>;
  failRemoveFor?: string;
}) {
  const calls: Call[] = [];
  const admin = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (fn === "list_verification_documents_due") return { data: options.due, error: null };
      if (fn === "mark_verification_documents_deleted")
        return { data: (args as { p_application_ids: string[] }).p_application_ids.length, error: null };
      return { data: null, error: { message: "unexpected" } };
    },
    storage: {
      from: (bucket: string) => ({
        list: async (folder: string) => {
          calls.push({ fn: `list:${bucket}`, args: folder });
          return { data: (options.files[folder] ?? []).map((name) => ({ name, id: name })), error: null };
        },
        remove: async (paths: string[]) => {
          calls.push({ fn: `remove:${bucket}`, args: paths });
          const failed = options.failRemoveFor && paths.some((path) => path.startsWith(options.failRemoveFor!));
          return failed ? { data: null, error: { message: "boom" } } : { data: [], error: null };
        },
      }),
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}

describe("verification document retention", () => {
  const due = [
    { application_id: "app-1", student_id: "stu-1", institution_id: "inst" },
    { application_id: "app-2", student_id: "stu-2", institution_id: "inst" },
  ];

  it("removes every file in each due application's folder, then marks those applications", async () => {
    const { admin, calls } = fakeAdmin({
      due,
      files: { "stu-1/app-1": ["id-card.webp", "selfie.webp", "id-card.jpg"], "stu-2/app-2": [] },
    });
    const result = await purgeVerificationDocuments(admin);
    expect(result).toEqual({ due: 2, deleted: 2, failed: 0 });
    expect(calls.find((call) => call.fn === "remove:verification-documents")?.args).toEqual([
      "stu-1/app-1/id-card.webp",
      "stu-1/app-1/selfie.webp",
      "stu-1/app-1/id-card.jpg",
    ]);
    expect(calls.at(-1)).toEqual({ fn: "mark_verification_documents_deleted", args: { p_application_ids: ["app-1", "app-2"] } });
  });

  it("leaves an application unmarked when its files can't be removed, so the next run retries", async () => {
    const { admin, calls } = fakeAdmin({
      due,
      files: { "stu-1/app-1": ["id-card.webp"], "stu-2/app-2": ["selfie.webp"] },
      failRemoveFor: "stu-1/",
    });
    const result = await purgeVerificationDocuments(admin);
    expect(result).toEqual({ due: 2, deleted: 1, failed: 1 });
    expect(calls.at(-1)).toEqual({ fn: "mark_verification_documents_deleted", args: { p_application_ids: ["app-2"] } });
  });

  it("does nothing when nothing is due", async () => {
    const { admin, calls } = fakeAdmin({ due: [], files: {} });
    expect(await purgeVerificationDocuments(admin)).toEqual({ due: 0, deleted: 0, failed: 0 });
    expect(calls.map((call) => call.fn)).toEqual(["list_verification_documents_due"]);
  });
});
