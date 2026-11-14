import "server-only";
import { getServerEnv } from "@/lib/env.server";

/** Sends a plain transactional email through Resend's HTTP API. */
export async function sendEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html: string }) {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) throw new Error("Email sending isn't configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [to], subject, text, html }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Resend responded ${response.status}`);
}
