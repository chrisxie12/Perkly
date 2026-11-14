import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["email", "magiclink", "signup"];

/** Backup for the code: the link in the sign-in email lands here. */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const failed = new URL("/login?link=expired", request.url);

  if (!hasSupabaseEnv() || !tokenHash || !type || !ALLOWED_TYPES.includes(type) || tokenHash.length > 512) {
    return NextResponse.redirect(failed);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return NextResponse.redirect(failed);

  const response = NextResponse.redirect(new URL("/auth/continue", request.url));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
