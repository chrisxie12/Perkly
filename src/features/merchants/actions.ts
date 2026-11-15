"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseHours, summariseHours } from "./hours";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { readForm } from "@/features/admin/schemas";
import { ACTIVE_MERCHANT_COOKIE } from "./queries";
import {
  branchLocationSchema,
  branchSchema,
  merchantDecisionSchema,
  merchantErrorMessage,
  merchantProfileSchema,
  registerMerchantSchema,
  shopDetailsSchema,
  teamMemberSchema,
} from "./schemas";
import { coordsFromMapsLink } from "./shop";

// Every action calls a database function that checks who the caller is and
// what they may do. These are conveniences; the database decides.

const unavailable: FormState = { status: "error", message: "This isn't available in this environment yet." };

export async function registerMerchant(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerMerchantSchema.safeParse(readForm(formData, ["displayName", "categoryId", "phone", "email", "description"]));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_merchant", {
    p_display_name: parsed.data.displayName,
    p_category_id: parsed.data.categoryId,
    p_phone: parsed.data.phone ?? null,
    p_email: parsed.data.email ?? null,
    p_description: parsed.data.description ?? null,
  });
  if (error) return { status: "error", message: merchantErrorMessage(error.message) };

  (await cookies()).set(ACTIVE_MERCHANT_COOKIE, data as string, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/merchant",
  });
  revalidatePath("/", "layout");
  // Owners need two-step verification from here on; the area guard sends them to set it up.
  redirect("/merchant?registered=1");
}

export async function chooseMerchant(formData: FormData): Promise<void> {
  const merchantId = String(formData.get("merchantId") ?? "");
  const ctx = await getUserContext();
  if (ctx?.merchantRoles.some((m) => m.merchantId === merchantId)) {
    (await cookies()).set(ACTIVE_MERCHANT_COOKIE, merchantId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/merchant",
    });
  }
  redirect("/merchant");
}

export async function saveMerchantProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = merchantProfileSchema.safeParse(
    readForm(formData, ["merchantId", "displayName", "categoryId", "legalName", "description", "phone", "email", "website"]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_merchant_profile", {
    p_merchant_id: v.merchantId,
    p_display_name: v.displayName,
    p_category_id: v.categoryId,
    p_legal_name: v.legalName ?? null,
    p_description: v.description ?? null,
    p_phone: v.phone ?? null,
    p_email: v.email ?? null,
    p_website: v.website ?? null,
  });
  if (error) return { status: "error", message: merchantErrorMessage(error.message) };
  revalidatePath("/merchant", "layout");
  return { status: "success", message: "Saved." };
}

export async function saveBranch(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = branchSchema.safeParse(
    readForm(formData, [
      "merchantId",
      "branchId",
      "name",
      "addressLine",
      "area",
      "city",
      "digitalAddress",
      "latitude",
      "longitude",
      "phone",
      "openingHours",
      "isActive",
    ]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const hours = parseHours(formData.get("hours"));
  if (hours === null) return { status: "error", fieldErrors: { hours: "Check the opening and closing times." } };
  if (!hasSupabaseEnv()) return unavailable;
  const v = parsed.data;
  const supabase = await createClient();
  const { data: branchId, error } = await supabase.rpc("upsert_merchant_branch", {
    p_merchant_id: v.merchantId,
    p_branch_id: v.branchId ?? null,
    p_name: v.name,
    p_address_line: v.addressLine ?? null,
    p_area: v.area ?? null,
    p_city: v.city ?? "Accra",
    p_digital_address: v.digitalAddress ?? null,
    p_latitude: v.latitude ?? null,
    p_longitude: v.longitude ?? null,
    p_phone: v.phone ?? null,
    p_opening_hours: summariseHours(hours) ?? v.openingHours ?? null,
    p_is_active: v.isActive === "true",
  });
  if (error) return { status: "error", message: merchantErrorMessage(error.message) };
  const hoursResult = await supabase.rpc("set_branch_hours", { p_branch_id: branchId, p_hours: hours });
  if (hoursResult.error)
    return { status: "error", message: "The branch was saved, but its hours weren't. Check the times and save again." };
  revalidatePath("/merchant", "layout");
  if (v.branchId) return { status: "success", message: `Saved ${v.name}.` };
  redirect("/merchant/branches?added=1");
}

export async function submitForReview(formData: FormData): Promise<void> {
  const merchantId = String(formData.get("merchantId") ?? "");
  if (!hasSupabaseEnv() || !/^[0-9a-f-]{36}$/.test(merchantId)) redirect("/merchant");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_merchant_for_review", { p_merchant_id: merchantId });
  revalidatePath("/", "layout");
  redirect(error ? `/merchant?error=${encodeURIComponent(error.message.slice(0, 40))}` : "/merchant?submitted=1");
}

export async function addTeamMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = teamMemberSchema.safeParse({
    ...readForm(formData, ["merchantId", "email", "role"]),
    branchIds: formData.getAll("branchIds").map(String),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_merchant_user", {
    p_merchant_id: parsed.data.merchantId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_branch_ids: parsed.data.role === "cashier" ? parsed.data.branchIds : [],
  });
  if (error) return { status: "error", message: merchantErrorMessage(error.message) };
  revalidatePath("/merchant/team");
  return { status: "success", message: `Added ${parsed.data.email} as ${parsed.data.role === "manager" ? "a manager" : "a cashier"}.` };
}

export async function removeTeamMember(formData: FormData): Promise<void> {
  const memberId = z.uuid().safeParse(formData.get("memberId"));
  if (!memberId.success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("remove_merchant_user", { p_merchant_user_id: memberId.data });
  revalidatePath("/merchant/team");
}

export async function decideMerchant(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = merchantDecisionSchema.safeParse(readForm(formData, ["merchantId", "decision", "reason"]));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_merchant", {
    p_merchant_id: parsed.data.merchantId,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return { status: "error", message: merchantErrorMessage(error.message) };
  revalidatePath("/admin", "layout");
  return {
    status: "success",
    message: {
      approve: "Approved. The business is now live.",
      reject: "Rejected. The owner sees your reason.",
      suspend: "Suspended. Students can no longer see it.",
      reinstate: "Reinstated. The business is live again.",
    }[parsed.data.decision],
  };
}

// Shop page -----------------------------------------------------------------------------

export async function saveShopDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = shopDetailsSchema.safeParse({
    ...readForm(formData, ["merchantId", "priceRange", "whatsapp", "instagram", "tiktok", "facebook", "x", "snapchat"]),
    ...(formData.get("whatsappSameAsPhone") === "on" ? { whatsapp: String(formData.get("phone") ?? "") || undefined } : {}),
    paymentMethods: formData.getAll("paymentMethods").map(String),
    amenities: formData.getAll("amenities").map(String),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const v = parsed.data;
  const socials = Object.fromEntries(
    (["instagram", "tiktok", "facebook", "x", "snapchat"] as const).flatMap((k) => (v[k] ? [[k, v[k]]] : [])),
  );
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_shop_details", {
    p_merchant_id: v.merchantId,
    p_price_range: v.priceRange ?? null,
    p_whatsapp: v.whatsapp ?? null,
    p_socials: socials,
    p_payment_methods: v.paymentMethods,
    p_amenities: v.amenities,
  });
  if (error) return { status: "error", message: merchantErrorMessage(error.message) };
  revalidatePath("/merchant", "layout");
  revalidatePath("/student", "layout");
  return { status: "success", message: "Saved. Students see this on your shop page." };
}

export async function saveBranchLocation(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = branchLocationSchema.safeParse(readForm(formData, ["branchId", "landmark", "mapsUrl"]));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const v = parsed.data;
  // Only full links carry coordinates; a short maps.app.goo.gl link keeps the branch's existing ones.
  const coords = v.mapsUrl ? coordsFromMapsLink(v.mapsUrl) : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_branch_location", {
    p_branch_id: v.branchId,
    p_landmark: v.landmark ?? null,
    p_maps_url: v.mapsUrl ?? null,
    p_latitude: coords?.latitude ?? null,
    p_longitude: coords?.longitude ?? null,
  });
  if (error) return { status: "error", message: merchantErrorMessage(error.message) };
  revalidatePath("/merchant", "layout");
  revalidatePath("/student", "layout");
  return {
    status: "success",
    message: coords
      ? "Saved, with the map pin from your link."
      : v.mapsUrl
        ? "Saved. Short links don't include the pin, so walking times use the location set on the branch."
        : "Saved.",
  };
}

const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/;

export async function addShopPhoto(merchantId: string, path: string, caption: string | null): Promise<{ ok: boolean; message?: string }> {
  if (!hasSupabaseEnv()) return { ok: false, message: unavailable.message };
  if (!PHOTO_PATH.test(path) || !path.startsWith(`${merchantId}/`)) return { ok: false, message: "That photo didn't upload. Try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_merchant_photo", { p_merchant_id: merchantId, p_path: path, p_caption: caption });
  if (error) {
    await supabase.storage.from("merchant-photos").remove([path]);
    return { ok: false, message: merchantErrorMessage(error.message) };
  }
  revalidatePath("/merchant/profile");
  revalidatePath("/student", "layout");
  return { ok: true };
}

export async function editShopPhoto(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("photoId"));
  const action = z.enum(["remove", "cover", "caption"]).safeParse(formData.get("action"));
  if (!id.success || !action.success || !hasSupabaseEnv()) return;
  const caption = String(formData.get("caption") ?? "").slice(0, 140);
  const supabase = await createClient();
  const { data: removedPath, error } = await supabase.rpc("edit_merchant_photo", {
    p_photo_id: id.data,
    p_action: action.data,
    p_caption: caption,
  });
  if (!error && typeof removedPath === "string") await supabase.storage.from("merchant-photos").remove([removedPath]);
  revalidatePath("/merchant/profile");
  revalidatePath("/student", "layout");
}
