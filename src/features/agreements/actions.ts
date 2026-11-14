"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";

const signSchema = z.object({
  merchantId: z.uuid(),
  version: z.coerce.number().int().min(1),
  businessLegalName: z
    .string({ error: "Enter the business's registered name." })
    .trim()
    .min(2, "Enter the business's registered name.")
    .max(160),
  signerName: z.string({ error: "Type your full name to sign." }).trim().min(3, "Type your full name to sign.").max(120),
  signerRole: z.string({ error: "Enter your role, for example Owner." }).trim().min(2, "Enter your role, for example Owner.").max(80),
  accept: z.literal("yes", { error: "Tick the box to agree." }),
});

const MESSAGES: Record<string, string> = {
  forbidden: "Only the business owner can sign, with two-step verification on.",
  agreement_outdated: "The agreement was updated. Reload the page and read the new version.",
  acceptance_required: "Tick the box to agree.",
};

export async function signAgreement(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signSchema.safeParse({
    merchantId: formData.get("merchantId"),
    version: formData.get("version"),
    businessLegalName: formData.get("businessLegalName"),
    signerName: formData.get("signerName"),
    signerRole: formData.get("signerRole"),
    accept: formData.get("accept") ?? undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_merchant_agreement", {
    p_merchant_id: parsed.data.merchantId,
    p_version: parsed.data.version,
    p_signer_name: parsed.data.signerName,
    p_signer_role: parsed.data.signerRole,
    p_business_legal_name: parsed.data.businessLegalName,
    p_accept: true,
    p_user_agent: h.get("user-agent")?.slice(0, 400) ?? null,
    p_ip_address: ip,
  });
  if (error) return { status: "error", message: MESSAGES[error.message] ?? "Couldn't record your signature. Try again." };
  revalidatePath("/merchant", "layout");
  return { status: "success", message: "Signed. A copy is below and in your records." };
}
