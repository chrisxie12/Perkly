import { describe, expect, it } from "vitest";
import { cedisToPesewas, eventSchema, formatCedis, formatTicketCode, savingLabel, ticketPriceFormSchema } from "@/features/campus/schemas";

const ids = { postId: "00000000-0000-4000-8000-000000000001", organisationId: "00000000-0000-4000-8000-000000000002" };

describe("event tickets", () => {
  it("reads cedis typed by organisers", () => {
    expect(cedisToPesewas("30")).toBe(3000);
    expect(cedisToPesewas("12.5")).toBe(1250);
    expect(cedisToPesewas("GH₵ 7.25")).toBe(725);
    expect(cedisToPesewas("0")).toBe(0);
    expect(cedisToPesewas("1.234")).toBeNull();
    expect(cedisToPesewas("")).toBeNull();
    expect(cedisToPesewas(undefined)).toBeNull();
  });

  it("formats prices, savings and codes", () => {
    expect(formatCedis(3000)).toBe("GH₵30");
    expect(formatCedis(1250)).toBe("GH₵12.50");
    expect(savingLabel(5000, 3000)).toBe("Save GH₵20");
    expect(formatTicketCode("ABCD2345")).toBe("ABCD 2345");
  });

  it("needs a normal price of at least GH₵1 and a lower student price", () => {
    expect(ticketPriceFormSchema.safeParse({ ...ids, normal: "50", student: "30" }).success).toBe(true);
    expect(ticketPriceFormSchema.safeParse({ ...ids, normal: "50", student: "0" }).success).toBe(true);
    expect(ticketPriceFormSchema.safeParse({ ...ids, normal: "50", student: "50" }).success).toBe(false);
    expect(ticketPriceFormSchema.safeParse({ ...ids, normal: "0.5", student: "0" }).success).toBe(false);
    expect(ticketPriceFormSchema.safeParse({ ...ids, normal: "", student: "10" }).success).toBe(false);
    // Turning tickets off sends neither price.
    expect(ticketPriceFormSchema.safeParse({ ...ids }).success).toBe(true);
  });

  it("still reads event details from before tickets existed", () => {
    const old = {
      starts_at: "2026-11-29T18:00:00Z",
      ends_at: null,
      venue: "Hall",
      capacity: null,
      rsvp_open: true,
      going: 3,
      i_am_going: false,
      over: false,
    };
    const parsed = eventSchema.parse(old);
    expect(parsed.ticketed).toBe(false);
    expect(parsed.my_ticket).toBeNull();
  });
});
