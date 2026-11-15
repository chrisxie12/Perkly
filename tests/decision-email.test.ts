import { describe, expect, it } from "vitest";
import { buildDecisionEmail, decisionNoticeSchema, type DecisionNotice } from "@/features/students/decision-email";

const base: DecisionNotice = {
  email: "ama@example.com",
  first_name: "Ama",
  status: "approved",
  decision_reason: null,
  reviewer_note: null,
  institution_short_name: "GCTU",
  verified_until: "2027-07-31T23:59:59Z",
};

describe("decision emails", () => {
  it("tells an approved student how long verification lasts and links to their area", () => {
    const email = buildDecisionEmail(base, "https://perqly-eta.vercel.app/");
    expect(email.subject).toBe("You're verified on Perqly");
    expect(email.text).toContain("Hi Ama,");
    expect(email.text).toContain("Perqly has confirmed you're a GCTU student");
    expect(email.text).toMatch(/until (31 July|1 August) 2027/);
    expect(email.text).toContain("https://perqly-eta.vercel.app/student");
  });

  it("explains a rejection with the reason and the reviewer's note", () => {
    const email = buildDecisionEmail(
      { ...base, status: "rejected", decision_reason: "id_mismatch", reviewer_note: "Number not found" },
      "https://x.test",
    );
    expect(email.subject).toBe("Your Perqly verification wasn't approved");
    expect(email.text).toContain("didn't match the one on your student ID card");
    expect(email.text).toContain("Their note: Number not found");
  });

  it("asks for changes with the reviewer's note", () => {
    const email = buildDecisionEmail({ ...base, status: "resubmission_requested", reviewer_note: "Selfie is blurred" }, "https://x.test");
    expect(email.subject).toBe("Your Perqly verification needs a change");
    expect(email.text).toContain("Their note: Selfie is blurred");
  });

  it("escapes the reviewer's note and the student's name in the HTML", () => {
    const email = buildDecisionEmail(
      { ...base, first_name: "<b>Ama</b>", status: "resubmission_requested", reviewer_note: '<a href="https://evil.test">click</a>' },
      "https://x.test",
    );
    expect(email.html).not.toContain('<a href="https://evil.test">');
    expect(email.html).toContain("&lt;a href=&quot;https://evil.test&quot;&gt;click&lt;/a&gt;");
    expect(email.html).toContain("Hi &lt;b&gt;Ama&lt;/b&gt;,");
  });

  it("greets without a name when there is none", () => {
    expect(buildDecisionEmail({ ...base, first_name: null }, "https://x.test").text.startsWith("Hi,")).toBe(true);
  });

  it("only accepts notices for decided applications", () => {
    expect(decisionNoticeSchema.safeParse({ ...base, status: "submitted" }).success).toBe(false);
    expect(decisionNoticeSchema.safeParse(base).success).toBe(true);
  });
});
