import { describe, expect, it } from "vitest";
import {
  agreementFormSchema,
  campusErrorMessage,
  commentFormSchema,
  decodeCursor,
  eventFormSchema,
  formatDay,
  formatEventTime,
  goingLabel,
  nextEventCursor,
  parseLocalTime,
  toLocalInput,
} from "@/features/campus/schemas";

const ID = "22222222-2222-4222-8222-222222222222";
const ORG = "11111111-1111-4111-8111-111111111111";

describe("agreement form", () => {
  const base = { institutionId: ID, signedOn: "2026-11-01", signedByName: "Registrar", documentRef: "Drive › Agreements" };
  it("accepts an agreement with or without an end date", () => {
    expect(agreementFormSchema.safeParse(base).success).toBe(true);
    expect(agreementFormSchema.safeParse({ ...base, endsOn: "2027-11-01" }).success).toBe(true);
  });
  it("refuses an end on or before the signing date", () => {
    const r = agreementFormSchema.safeParse({ ...base, endsOn: "2026-11-01" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["endsOn"]);
  });
  it("needs who signed and where the copy is", () => {
    expect(agreementFormSchema.safeParse({ ...base, signedByName: "  " }).success).toBe(false);
    expect(agreementFormSchema.safeParse({ ...base, documentRef: "x" }).success).toBe(false);
    expect(agreementFormSchema.safeParse({ ...base, signedOn: "1 Nov" }).success).toBe(false);
  });
  it("shows dates plainly", () => {
    expect(formatDay("2026-11-01")).toBe("1 Nov 2026");
    expect(formatDay(null)).toBe("");
  });
});

describe("comment form", () => {
  it("trims and limits comments", () => {
    expect(commentFormSchema.safeParse({ postId: ID, body: " See you there " }).data?.body).toBe("See you there");
    expect(commentFormSchema.safeParse({ postId: ID, body: "   " }).success).toBe(false);
    expect(commentFormSchema.safeParse({ postId: ID, body: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("event form", () => {
  const base = { postId: ID, organisationId: ORG, startsAt: "2026-11-21T18:00", venue: "Main hall", rsvpOpen: true };
  it("accepts an event with optional end and capacity", () => {
    expect(eventFormSchema.safeParse(base).success).toBe(true);
    const r = eventFormSchema.safeParse({ ...base, endsAt: "2026-11-21T22:00", capacity: "50" });
    expect(r.success && r.data.capacity).toBe(50);
  });
  it("refuses an end before the start, over 14 days, or a bad capacity", () => {
    expect(eventFormSchema.safeParse({ ...base, endsAt: "2026-11-21T17:00" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...base, endsAt: "2026-12-10T17:00" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...base, capacity: "0" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...base, capacity: "2.5" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...base, startsAt: "tomorrow" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...base, venue: " " }).success).toBe(false);
  });
  it("reads times as Ghana time (UTC) and back", () => {
    expect(parseLocalTime("2026-11-21T18:00")).toBe("2026-11-21T18:00:00.000Z");
    expect(parseLocalTime("21/11/2026")).toBeNull();
    expect(toLocalInput("2026-11-21T18:00:00+00:00")).toBe("2026-11-21T18:00");
    expect(toLocalInput(null)).toBe("");
  });
});

describe("event labels", () => {
  it("shows the time, with the end on the same or another day", () => {
    expect(formatEventTime("2026-11-21T18:00:00Z", null)).toBe("Sat 21 Nov, 18:00");
    expect(formatEventTime("2026-11-21T18:00:00Z", "2026-11-21T22:00:00Z")).toBe("Sat 21 Nov, 18:00 – 22:00");
    expect(formatEventTime("2026-11-21T18:00:00Z", "2026-11-22T02:00:00Z")).toBe("Sat 21 Nov, 18:00 – Sun 22 Nov, 02:00");
  });
  it("counts places", () => {
    expect(goingLabel({ going: 3, capacity: null })).toBe("3 going");
    expect(goingLabel({ going: 3, capacity: 50 })).toBe("3 of 50 going");
    expect(goingLabel({ going: 50, capacity: 50 })).toBe("Full (50 going)");
  });
  it("pages events by start time", () => {
    const page = Array.from({ length: 30 }, (_, i) => ({
      id: ID,
      event: { starts_at: `2026-11-${String(i + 1).padStart(2, "0")}T10:00:00Z` },
    }));
    expect(decodeCursor(nextEventCursor(page))).toEqual({ at: "2026-11-30T10:00:00Z", id: ID });
    expect(nextEventCursor(page.slice(1))).toBeNull();
  });
  it("explains event errors", () => {
    expect(campusErrorMessage("event_full")).toBe("This event is full.");
    expect(campusErrorMessage("ERROR: rsvp_closed")).toBe("The organisers have closed RSVPs for this event.");
    expect(campusErrorMessage("event_not_found")).toBe("This post isn't an event.");
  });
});
