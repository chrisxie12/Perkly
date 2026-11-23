import { describe, expect, it } from "vitest";
import { themeScript, THEME_STORAGE_KEY } from "@/lib/theme/script";

/** Runs the head script against a tiny fake page and returns the theme it picked. */
function run({ saved, phoneDark }: { saved: string | null; phoneDark: boolean }) {
  const root = { dataset: {} as Record<string, string> };
  const store = new Map<string, string>(saved === null ? [] : [[THEME_STORAGE_KEY, saved]]);
  const env = {
    document: { documentElement: root, querySelectorAll: () => [] },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    matchMedia: () => ({ matches: phoneDark, addEventListener() {} }),
    navigator: {},
    window: {} as { __perqlyTheme?: (c: string) => void },
  };
  new Function("document", "localStorage", "matchMedia", "navigator", "window", themeScript)(
    env.document,
    env.localStorage,
    env.matchMedia,
    env.navigator,
    env.window,
  );
  return { theme: root.dataset.theme, set: env.window.__perqlyTheme!, root };
}

describe("theme default", () => {
  it("is light on a phone set to dark mode", () => expect(run({ saved: null, phoneDark: true }).theme).toBe("light"));
  it("is light when nothing is saved", () => expect(run({ saved: null, phoneDark: false }).theme).toBe("light"));
  it("ignores an old 'system' choice", () => expect(run({ saved: "system", phoneDark: true }).theme).toBe("light"));
  it("is dark only when turned on in Account", () => expect(run({ saved: "dark", phoneDark: false }).theme).toBe("dark"));
  it("switches when the setting changes", () => {
    const r = run({ saved: null, phoneDark: false });
    r.set("dark");
    expect(r.root.dataset.theme).toBe("dark");
  });
});
