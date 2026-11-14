"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getRequestOrigin } from "@/lib/auth/origin";
import { sendEmail } from "@/lib/email/send";
import { getSiteUrl, hasSupabaseEnv } from "@/lib/env";
import { isDecisionEmailEnabled } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildDecisionEmail, decisionNoticeSchema } from "@/features/students/decision-email";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { studentErrorMessage } from "@/features/students/status";

const decisionSchema = z
  .object({
    applicationId: z.uuid(),
    decision: z.enum(["approve", "reject", "request_resubmission"], { error: "Choose a decision." }),
    reason: z.string().optional(),
    note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "reject" && !value.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Choose a reason." });
    if (value.decision === "reject" && value.reason === "other" && !value.note)
      ctx.addIssue({ code: "custom", path: ["note"], message: "Explain the reason in a note." });
    if (value.decision === "request_resubmission" && (!value.note || value.note.length < 5)) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Tell the student what to change." });
    }
  });

export async function decideApplication(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = decisionSchema.safeParse({
    applicationId: formData.get("applicationId"),
    decision: formData.get("decision") ?? undefined,
    reason: (formData.get("reason") as string | null) || undefined,
    note: (formData.get("note") as string | null) || undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_verification", {
    p_application_id: parsed.data.applicationId,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.decision === "reject" ? parsed.data.reason : null,
    p_note: parsed.data.note ?? null,
  });
  if (error) return { status: "error", message: studentErrorMessage(error.message) };

  if (isDecisionEmailEnabled()) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ? getSiteUrl() : await getRequestOrigin();
    const applicationId = parsed.data.applicationId;
    // After the response: a slow or failed email never holds up or undoes the decision.
    after(() => sendDecisionEmail(applicationId, siteUrl));
  }

  revalidatePath("/institution", "layout");
  redirect(`/institution/reviews?decided=${parsed.data.decision}`);
}

/**
 * Emails the student about the decision. The email address comes from a
 * service-role-only function, so the reviewer never sees it.
 */
async function sendDecisionEmail(applicationId: string, siteUrl: string) {
  try {
    const { data, error } = await createAdminClient().rpc("get_verification_notice", { p_application_id: applicationId });
    if (error || !data) return;
    const notice = decisionNoticeSchema.safeParse(data);
    if (!notice.success) return;
    const email = buildDecisionEmail(notice.data, siteUrl);
    await sendEmail({ to: notice.data.email, ...email });
  } catch (error) {
    console.error("[decision email] not sent", error instanceof Error ? error.message : "unknown error");
  }
}
