import { describe, expect, it } from "vitest";
import { MissingEnvError, parsePublicEnv } from "@/lib/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijkl.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdefghij",
};

describe("parsePublicEnv", () => {
  it("accepts a valid project URL and publishable key", () => {
    expect(parsePublicEnv(valid)).toMatchObject(valid);
  });

  it("rejects missing values with a helpful error", () => {
    expect(() => parsePublicEnv({})).toThrow(MissingEnvError);
  });

  it("rejects a secret key in a public variable", () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_0123456789abcdefghijkl" })).toThrow(
      /SECRET key/,
    );
  });

  it("rejects plain http for a hosted project", () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "http://abcdefghijkl.supabase.co" })).toThrow(/https/);
  });

  it("allows http for a local Supabase", () => {
    expect(parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }).NEXT_PUBLIC_SUPABASE_URL).toBe(
      "http://127.0.0.1:54321",
    );
  });
});
