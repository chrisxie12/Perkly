import { describe, expect, it } from "vitest";
import Home from "@/app/opengraph-image";
import Merchants from "@/app/(marketing)/merchants/opengraph-image";

// The link preview (WhatsApp, X, iMessage). Rendering fails loudly on layout mistakes, so draw both.
describe("link preview images", () => {
  it("draws the home and business previews as 1200x630 PNGs", async () => {
    for (const draw of [Home, Merchants]) {
      const bytes = new Uint8Array(await (await draw()).arrayBuffer());
      expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
      const view = new DataView(bytes.buffer);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
    }
  }, 60_000);
});
