"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/features/auth/types";
import { normaliseShortCode, REJECT_REASONS, PAYMENT_METHODS, SHORT_CODE } from "./schemas";

type Result = {
  ok: boolean;
  error?: string;
  session_id?: string;
  merchant_name?: string;
  limit?: number;
  period?: string;
  resets_at?: string | null;
};

const uuid = z.uuid();
const unavailable = "/student/scan?error=unavailable";

function withError(path: string, result: Result | null, fallback = "unknown") {
  const params = new URLSearchParams({ error: result?.error ?? fallback });
  if (result?.session_id) params.set("session", result.session_id);
  if (result?.merchant_name) params.set("merchant", result.merchant_name.slice(0, 80));
  if (result?.limit) params.set("limit", String(result.limit));
  if (result?.period) params.set("period", result.period);
  if (result?.resets_at) params.set("resets", result.resets_at);
  return `${path}?${params.toString()}`;
}

/** Opens a session from a scan link or a typed code. The server checks everything. */
export async function openSession(input: { token?: string; shortCode?: string }): Promise<string> {
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_redemption_session", {
    p_token: input.token ?? null,
    p_short_code: input.shortCode ?? null,
    p_client_request_id: randomUUID(),
    p_distance_hint: null,
  });
  const result = (data as Result | null) ?? null;
  if (error || !result) return withError("/student/scan", null);
  if (result.ok && result.session_id) return `/student/redeem/${result.session_id}`;
  return withError("/student/scan", result);
}

export async function enterShortCode(formData: FormData): Promise<void> {
  const code = normaliseShortCode(String(formData.get("code") ?? ""));
  if (!SHORT_CODE.test(code)) redirect("/student/scan/code?error=code_format");
  const next = await openSession({ shortCode: code });
  // Errors return to the code screen, not the camera.
  redirect(next.startsWith("/student/scan?") ? next.replace("/student/scan?", "/student/scan/code?") : next);
}

async function sessionCall(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: "unknown" } as Result;
  return (data as Result | null) ?? ({ ok: false, error: "unknown" } as Result);
}

export async function selectItem(formData: FormData): Promise<void> {
  const sessionId = uuid.safeParse(formData.get("sessionId"));
  const offerId = uuid.safeParse(formData.get("offerId"));
  if (!sessionId.success || !offerId.success) redirect("/student/scan");
  const path = `/student/redeem/${sessionId.data}`;
  if (!hasSupabaseEnv()) redirect(unavailable);
  const result = await sessionCall("select_redemption_item", { p_session_id: sessionId.data, p_offer_id: offerId.data });
  redirect(result.ok ? path : withError(path, result));
}

export async function confirmAsStudent(formData: FormData): Promise<void> {
  const sessionId = uuid.safeParse(formData.get("sessionId"));
  if (!sessionId.success) redirect("/student/scan");
  const path = `/student/redeem/${sessionId.data}`;
  if (!hasSupabaseEnv()) redirect(unavailable);
  const result = await sessionCall("student_confirm_redemption", { p_session_id: sessionId.data, p_client_request_id: randomUUID() });
  if (result.ok) revalidatePath("/student/history");
  redirect(result.ok ? path : withError(path, result));
}

export async function cancelSession(formData: FormData): Promise<void> {
  const sessionId = uuid.safeParse(formData.get("sessionId"));
  if (!sessionId.success) redirect("/student/scan");
  const path = `/student/redeem/${sessionId.data}`;
  if (!hasSupabaseEnv()) redirect(unavailable);
  const result = await sessionCall("cancel_redemption_session", { p_session_id: sessionId.data });
  redirect(result.ok ? path : withError(path, result));
}

export async function confirmAtCounter(formData: FormData): Promise<void> {
  const sessionId = uuid.safeParse(formData.get("sessionId"));
  const price = z.coerce.number().nonnegative().safeParse(formData.get("expectedFinalPrice"));
  if (!sessionId.success || !price.success) redirect("/merchant/counter?error=unknown");
  if (!hasSupabaseEnv()) redirect("/merchant/counter?error=unknown");
  const result = await sessionCall("merchant_confirm_redemption", {
    p_session_id: sessionId.data,
    p_expected_final_price: price.data,
    p_client_request_id: randomUUID(),
  });
  redirect(result.ok ? "/merchant/counter?done=confirmed" : withError("/merchant/counter", result));
}

export async function rejectAtCounter(formData: FormData): Promise<void> {
  const sessionId = uuid.safeParse(formData.get("sessionId"));
  const reason = z.enum(Object.keys(REJECT_REASONS) as [string, ...string[]]).safeParse(formData.get("reason"));
  const note = String(formData.get("note") ?? "").slice(0, 300);
  if (!sessionId.success || !reason.success) redirect("/merchant/counter?error=reason_required");
  if (!hasSupabaseEnv()) redirect("/merchant/counter?error=unknown");
  const result = await sessionCall("merchant_reject_redemption", {
    p_session_id: sessionId.data,
    p_reason: reason.data,
    p_note: note || null,
  });
  redirect(result.ok ? "/merchant/counter?done=declined" : withError("/merchant/counter", result));
}

export async function recordPayment(formData: FormData): Promise<void> {
  const id = uuid.safeParse(formData.get("redemptionId"));
  const method = z.enum(Object.keys(PAYMENT_METHODS) as [string, ...string[]]).safeParse(formData.get("method"));
  const status = z.enum(["paid", "unpaid"]).safeParse(formData.get("status"));
  if (!id.success || !method.success || !status.success) redirect("/merchant/redemptions?error=payment_invalid");
  if (!hasSupabaseEnv()) redirect("/merchant/redemptions?error=unknown");
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", { p_redemption_id: id.data, p_method: method.data, p_status: status.data });
  if (error) redirect(`/merchant/redemptions?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/merchant/redemptions");
  redirect("/merchant/redemptions?saved=1");
}

export async function reissueCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const branchId = uuid.safeParse(formData.get("branchId"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!branchId.success) return { status: "error", message: "Choose a branch." };
  if (reason.length < 3) return { status: "error", fieldErrors: { reason: "Say why, for example Code photographed and shared." } };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reissue_branch_qr", { p_branch_id: branchId.data, p_reason: reason.slice(0, 300) });
  if (error) {
    const messages: Record<string, string> = {
      forbidden: "Only owners (with two-step verification) and managers can do this.",
      rate_limited: "This branch has had 5 new codes today. Try again tomorrow.",
      merchant_not_approved: "Your business must be live first.",
    };
    return { status: "error", message: messages[error.message] ?? "Couldn't issue a new code. Try again." };
  }
  revalidatePath("/merchant/codes");
  return { status: "success", message: "New code issued. The old one stops working now: print and display the new poster." };
}

export async function recordCodeDownload(qrCodeId: string) {
  if (!uuid.safeParse(qrCodeId).success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("record_qr_download", { p_qr_code_id: qrCodeId });
}

export async function voidRedemption(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuid.safeParse(formData.get("redemptionId"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id.success) return { status: "error", message: "Choose a redemption." };
  if (reason.length < 5) return { status: "error", fieldErrors: { reason: "Record why it's being voided." } };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_redemption", { p_redemption_id: id.data, p_reason: reason.slice(0, 500) });
  if (error) {
    return {
      status: "error",
      message:
        error.message === "redemption_voided"
          ? "Already voided."
          : error.message === "forbidden"
            ? "Only Perqly support can void."
            : "Couldn't void. Try again.",
    };
  }
  revalidatePath("/admin/redemptions");
  return { status: "success", message: "Voided. The student's savings and the offer's count were reversed." };
}
