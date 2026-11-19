import { describe, expect, it } from "vitest";
import { MERCHANT_REASONS, STUDENT_REASONS, disputeErrorMessage, noteSchema, openFormSchema } from "@/features/disputes/schemas";

const ID = "22222222-2222-4222-8222-222222222222";

describe("problem report form", () => {
  it("needs exactly one subject, a reason and some detail", () => {
    expect(openFormSchema.safeParse({ redemptionId: ID, reason: "wrong_price", details: "Charged GHS 80, not 64." }).success).toBe(true);
    expect(openFormSchema.safeParse({ bookingId: ID, reason: "booking_problem", details: "Shop was closed when I came." }).success).toBe(
      true,
    );
    expect(openFormSchema.safeParse({ reason: "other", details: "Something went wrong." }).success).toBe(false);
    expect(openFormSchema.safeParse({ redemptionId: ID, bookingId: ID, reason: "other", details: "Something went wrong." }).success).toBe(
      false,
    );
    expect(openFormSchema.safeParse({ redemptionId: ID, reason: "other", details: "short" }).success).toBe(false);
  });
  it("offers each side its own reasons, matching the database", () => {
    expect(Object.keys(STUDENT_REASONS)).toEqual([
      "wrong_price",
      "discount_refused",
      "charged_twice",
      "service_not_received",
      "staff_behaviour",
      "booking_problem",
      "other",
    ]);
    expect(Object.keys(MERCHANT_REASONS)).toEqual(["not_a_student", "wrong_item", "left_without_paying", "booking_problem", "other"]);
  });
  it("limits notes", () => {
    expect(noteSchema.safeParse({ disputeId: ID, body: "  " }).success).toBe(false);
    expect(noteSchema.safeParse({ disputeId: ID, body: "x".repeat(2001) }).success).toBe(false);
  });
  it("explains refusals", () => {
    expect(disputeErrorMessage("ERROR: dispute_already_open")).toBe("You already reported this. Add a note to the open report instead.");
    expect(disputeErrorMessage("nope")).toBe("Something went wrong. Try again.");
  });
});
