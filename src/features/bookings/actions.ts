"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { bookingErrorMessage, exceptionFormSchema, requestFormSchema, ruleFormSchema } from "./schemas";

// Bookings. Each action calls database functions that check who's asking, the slot,
// the limits and the shop's hours, and write the audit log and the notifications.

const unavailable: FormState = { status: "error", message: "This isn't available in this environment yet." };
const reload: FormState = { status: "error", message: "Reload the page and try again." };
const uuid = z.uuid();
const text = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};

function revalidateBookings() {
  revalidatePath("/student/bookings");
  revalidatePath("/merchant/bookings", "layout");
}

// Students -------------------------------------------------------------------------------------

export async function requestBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = requestFormSchema.safeParse({
    branchId: text(formData.get("branchId")),
    serviceId: text(formData.get("serviceId")),
    startsAt: text(formData.get("startsAt")),
    offerId: text(formData.get("offerId")),
    note: text(formData.get("note")),
    requestId: text(formData.get("requestId")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_booking", {
    p_branch_id: d.branchId,
    p_service_id: d.serviceId,
    p_starts_at: d.startsAt,
    p_offer_id: d.offerId ?? null,
    p_note: d.note ?? null,
    p_client_request_id: d.requestId,
  });
  if (error) return { status: "error", message: bookingErrorMessage(error.message) };
  revalidateBookings();
  redirect("/student/bookings?requested=1");
}

export async function cancelBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuid.safeParse(formData.get("bookingId"));
  if (!id.success) return reload;
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: id.data, p_reason: text(formData.get("reason")) ?? null });
  if (error) return { status: "error", message: bookingErrorMessage(error.message) };
  revalidateBookings();
  return { status: "success", message: "Booking cancelled." };
}

export async function answerReschedule(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuid.safeParse(formData.get("bookingId"));
  const accept = formData.get("accept");
  if (!id.success || (accept !== "1" && accept !== "0")) return reload;
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_reschedule", { p_booking_id: id.data, p_accept: accept === "1" });
  if (error) return { status: "error", message: bookingErrorMessage(error.message) };
  revalidateBookings();
  return { status: "success", message: accept === "1" ? "New time accepted." : "Booking cancelled." };
}

// Shops ----------------------------------------------------------------------------------------

export async function answerBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuid.safeParse(formData.get("bookingId"));
  const action = z.enum(["confirm", "reject", "propose"]).safeParse(formData.get("action"));
  if (!id.success || !action.success) return reload;
  const note = text(formData.get("note"));
  if (note && note.length > 500) return { status: "error", fieldErrors: { note: "Keep notes under 500 characters." } };
  let proposed: string | null = null;
  if (action.data === "propose") {
    const at = z.iso.datetime({ offset: true }).safeParse(text(formData.get("proposedAt")));
    if (!at.success) return { status: "error", fieldErrors: { proposedAt: "Choose one of the free times." } };
    proposed = at.data;
  }
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_booking", {
    p_booking_id: id.data,
    p_action: action.data,
    p_proposed_starts_at: proposed,
    p_note: note ?? null,
  });
  if (error) return { status: "error", message: bookingErrorMessage(error.message) };
  revalidateBookings();
  const done = { confirm: "Booking confirmed.", reject: "Request declined.", propose: "New time sent to the student." };
  return { status: "success", message: done[action.data] };
}

export async function markBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuid.safeParse(formData.get("bookingId"));
  const outcome = z.enum(["completed", "no_show"]).safeParse(formData.get("outcome"));
  if (!id.success || !outcome.success) return reload;
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_booking", { p_booking_id: id.data, p_outcome: outcome.data });
  if (error) return { status: "error", message: bookingErrorMessage(error.message) };
  revalidateBookings();
  return { status: "success", message: outcome.data === "completed" ? "Marked as done." : "Marked as missed." };
}

export async function setServiceBookable(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuid.safeParse(formData.get("serviceId"));
  const on = formData.get("on");
  if (!id.success || (on !== "1" && on !== "0")) return reload;
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_service_bookable", { p_service_id: id.data, p_bookable: on === "1" });
  if (error) return { status: "error", message: bookingErrorMessage(error.message) };
  revalidatePath("/merchant/bookings/setup");
  return { status: "success", message: on === "1" ? "Students can now book it." : "No longer bookable." };
}

export async function saveHours(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ruleFormSchema.safeParse({
    branchId: text(formData.get("branchId")),
    serviceId: text(formData.get("serviceId")),
    weekdays: formData.getAll("weekday"),
    start: text(formData.get("start")),
    end: text(formData.get("end")),
    slotMinutes: text(formData.get("slotMinutes")),
    capacity: text(formData.get("capacity")) ?? "1",
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  for (const weekday of new Set(d.weekdays)) {
    const { error } = await supabase.rpc("save_availability_rule", {
      p_rule_id: null,
      p_branch_id: d.branchId,
      p_service_id: d.serviceId,
      p_weekday: weekday,
      p_start: d.start,
      p_end: d.end,
      p_slot_minutes: d.slotMinutes,
      p_capacity: d.capacity,
      p_is_active: true,
    });
    if (error) return { status: "error", message: bookingErrorMessage(error.message) };
  }
  revalidatePath("/merchant/bookings/setup");
  return { status: "success", message: "Hours added." };
}

export async function deleteHours(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuid.safeParse(formData.get("ruleId"));
  if (!id.success) return reload;
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_availability_rule", { p_rule_id: id.data });
  if (error) return { status: "error", message: bookingErrorMessage(error.message) };
  revalidatePath("/merchant/bookings/setup");
  return { status: "success", message: "Removed." };
}

export async function addClosedDay(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = exceptionFormSchema.safeParse({
    branchId: text(formData.get("branchId")),
    serviceId: text(formData.get("serviceId")),
    date: text(formData.get("date")),
    closed: formData.get("closed") !== "0",
    start: text(formData.get("start")),
    end: text(formData.get("end")),
    reason: text(formData.get("reason")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_availability_exception", {
    p_branch_id: d.branchId,
    p_service_id: d.serviceId ?? null,
    p_date: d.date,
    p_is_closed: d.closed,
    p_start: d.closed ? null : d.start,
    p_end: d.closed ? null : d.end,
    p_reason: d.reason ?? null,
  });
  if (error) return { status: "error", message: bookingErrorMessage(error.message) };
  revalidatePath("/merchant/bookings/setup");
  return { status: "success", message: "Saved." };
}

export async function deleteClosedDay(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuid.safeParse(formData.get("exceptionId"));
  if (!id.success) return reload;
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_availability_exception", { p_exception_id: id.data });
  if (error) return { status: "error", message: bookingErrorMessage(error.message) };
  revalidatePath("/merchant/bookings/setup");
  return { status: "success", message: "Removed." };
}
