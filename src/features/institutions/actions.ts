"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
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

  revalidatePath("/institution", "layout");
  redirect(`/institution?decided=${parsed.data.decision}`);
}
