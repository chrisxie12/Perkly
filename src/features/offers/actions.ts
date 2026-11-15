"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { readForm } from "@/features/admin/schemas";
import { catalogueItemSchema, offerErrorMessage, offerSchema } from "./schemas";
import { deliverNotificationsSoon } from "@/lib/notifications/dispatch";

const unavailable: FormState = { status: "error", message: "This isn't available in this environment yet." };

/** Accra local date-time from a form (YYYY-MM-DDTHH:mm) to an ISO instant. Ghana is UTC+0 all year. */
const toInstant = (value?: string) => (value ? new Date(`${value}:00Z`).toISOString() : null);

export async function saveCatalogueItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = catalogueItemSchema.safeParse(
    readForm(formData, ["merchantId", "itemId", "kind", "name", "regularPrice", "description", "durationMinutes", "sku", "isActive"]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_catalogue_item", {
    p_merchant_id: v.merchantId,
    p_kind: v.kind,
    p_item_id: v.itemId ?? null,
    p_name: v.name,
    p_regular_price: v.regularPrice,
    p_description: v.description ?? null,
    p_duration_minutes: v.kind === "service" ? (v.durationMinutes ?? null) : null,
    p_sku: v.kind === "product" ? (v.sku ?? null) : null,
    p_is_active: v.isActive === "true",
  });
  if (error) return { status: "error", message: offerErrorMessage(error.message) };
  revalidatePath("/merchant/catalogue");
  return { status: "success", message: `Saved ${v.name}.` };
}

export async function saveOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = offerSchema.safeParse({
    ...readForm(formData, [
      "merchantId",
      "offerId",
      "item",
      "discountType",
      "discountValue",
      "conditions",
      "title",
      "description",
      "startsAt",
      "endsAt",
      "perStudentLimit",
      "perStudentPeriod",
      "totalCap",
    ]),
    institutionIds: formData.getAll("institutionIds").map(String),
    branchIds: formData.getAll("branchIds").map(String),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const v = parsed.data;
  const [kind, itemId] = v.item.split(":");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_offer", {
    p_merchant_id: v.merchantId,
    p_offer_id: v.offerId ?? null,
    p_item_kind: kind,
    p_item_id: itemId,
    p_discount_type: v.discountType,
    p_discount_value: v.discountValue,
    p_conditions: v.conditions,
    p_title: v.title ?? null,
    p_description: v.description ?? null,
    p_starts_at: toInstant(v.startsAt),
    p_ends_at: toInstant(v.endsAt),
    p_per_student_limit: v.perStudentLimit,
    p_per_student_period: v.perStudentPeriod,
    p_total_cap: v.totalCap ?? null,
    p_institution_ids: v.institutionIds,
    p_branch_ids: v.branchIds,
  });
  if (error) return { status: "error", message: offerErrorMessage(error.message) };
  revalidatePath("/merchant/offers");
  redirect(`/merchant/offers?saved=${data as string}`);
}

const offerIdSchema = z.uuid();

export async function submitOffer(formData: FormData): Promise<void> {
  const id = offerIdSchema.safeParse(formData.get("offerId"));
  if (!id.success || !hasSupabaseEnv()) redirect("/merchant/offers");
  const supabase = await createClient();
  deliverNotificationsSoon();
  const { data, error } = await supabase.rpc("submit_offer", { p_offer_id: id.data });
  revalidatePath("/merchant/offers");
  redirect(
    error ? `/merchant/offers?error=${encodeURIComponent(error.message.slice(0, 40))}` : `/merchant/offers?submitted=${data as string}`,
  );
}

export async function changeOfferState(formData: FormData): Promise<void> {
  const id = offerIdSchema.safeParse(formData.get("offerId"));
  const action = z.enum(["pause", "resume", "archive"]).safeParse(formData.get("action"));
  if (!id.success || !action.success || !hasSupabaseEnv()) redirect("/merchant/offers");
  const supabase = await createClient();
  deliverNotificationsSoon();
  const { error } = await supabase.rpc("set_offer_state", { p_offer_id: id.data, p_action: action.data });
  revalidatePath("/merchant/offers");
  redirect(error ? `/merchant/offers?error=${encodeURIComponent(error.message.slice(0, 40))}` : "/merchant/offers");
}

export async function moderateOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ offerId: z.uuid(), decision: z.enum(["approve", "reject", "takedown"]), reason: z.string().max(500).optional() })
    .safeParse(readForm(formData, ["offerId", "decision", "reason"]));
  if (!parsed.success) return { status: "error", message: "Choose a decision." };
  if ((parsed.data.decision === "reject" || parsed.data.decision === "takedown") && (parsed.data.reason ?? "").length < 5) {
    return { status: "error", fieldErrors: { reason: "Give the business a reason they can act on." } };
  }
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  deliverNotificationsSoon();
  const { error } = await supabase.rpc("moderate_offer", {
    p_offer_id: parsed.data.offerId,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return { status: "error", message: offerErrorMessage(error.message) };
  revalidatePath("/admin/offers");
  return {
    status: "success",
    message: { approve: "Approved. It's live.", reject: "Sent back with your reason.", takedown: "Taken down." }[parsed.data.decision],
  };
}

/** Save or unsave a business. RLS lets students write only their own favourites, of live businesses. */
/** Saves or unsaves a business without leaving the page (the heart button calls this). */
export async function setFavourite(merchantId: string, save: boolean): Promise<void> {
  const id = z.uuid().safeParse(merchantId);
  const ctx = await getUserContext();
  if (!id.success || !ctx || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  if (save)
    await supabase
      .from("favourites")
      .upsert({ student_id: ctx.userId, merchant_id: id.data }, { onConflict: "student_id,merchant_id", ignoreDuplicates: true });
  else await supabase.from("favourites").delete().eq("student_id", ctx.userId).eq("merchant_id", id.data);
  revalidatePath("/student", "layout");
}

/** Fallback for the heart button when JavaScript hasn't loaded yet. */
export async function toggleFavourite(formData: FormData): Promise<void> {
  const merchantId = z.uuid().safeParse(formData.get("merchantId"));
  const save = formData.get("save") === "true";
  const back = String(formData.get("back") ?? "/student");
  const ctx = await getUserContext();
  if (merchantId.success && ctx && hasSupabaseEnv()) {
    const supabase = await createClient();
    if (save)
      await supabase
        .from("favourites")
        .upsert({ student_id: ctx.userId, merchant_id: merchantId.data }, { onConflict: "student_id,merchant_id", ignoreDuplicates: true });
    else await supabase.from("favourites").delete().eq("student_id", ctx.userId).eq("merchant_id", merchantId.data);
  }
  revalidatePath("/student", "layout");
  redirect(back.startsWith("/student") ? back : "/student");
}
