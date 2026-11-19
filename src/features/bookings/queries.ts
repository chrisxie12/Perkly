import "server-only";

import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  bookableServiceSchema,
  bookingSchema,
  setupSchema,
  slotSchema,
  type BookableService,
  type Booking,
  type BookingSetup,
  type Slot,
} from "./schemas";

const list = z.array(bookingSchema).catch([]);

export async function getMyBookings(): Promise<Booking[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_bookings");
  if (error) throw new Error(`my_bookings failed (${error.code ?? "unknown"})`);
  return list.parse(data ?? []);
}

export async function getMerchantBookings(merchantId: string, scope: "upcoming" | "past"): Promise<Booking[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("merchant_bookings", { p_merchant_id: merchantId, p_scope: scope });
  if (error) throw new Error(`merchant_bookings failed (${error.code ?? "unknown"})`);
  return list.parse(data ?? []);
}

export async function getBookingSetup(merchantId: string): Promise<BookingSetup | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_setup", { p_merchant_id: merchantId });
  if (error || !data) return null;
  const parsed = setupSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function getBookableServices(merchantId: string): Promise<BookableService[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bookable_services", { p_merchant_id: merchantId });
  if (error) return [];
  return z
    .array(bookableServiceSchema)
    .catch([])
    .parse(data ?? []);
}

export async function getSlots(branchId: string, serviceId: string, day: string): Promise<Slot[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_branch_id: branchId,
    p_service_id: serviceId,
    p_from: day,
    p_to: day,
  });
  if (error) return [];
  return z
    .array(slotSchema)
    .catch([])
    .parse(data ?? []);
}
