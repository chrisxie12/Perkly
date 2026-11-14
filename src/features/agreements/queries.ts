import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AgreementVersion = { version: number; title: string; body: string; body_sha256: string; published_at: string };
export type AgreementSignature = {
  id: string;
  version: number;
  body_sha256: string;
  signer_name: string;
  signer_role: string;
  business_legal_name: string;
  signed_at: string;
};

/** The current agreement and this business's signature of it (null if unsigned). */
export async function getAgreementState(merchantId: string) {
  const supabase = await createClient();
  const [current, signatures] = await Promise.all([
    supabase
      .from("merchant_agreement_versions")
      .select("version, title, body, body_sha256, published_at")
      .eq("is_current", true)
      .maybeSingle(),
    supabase
      .from("merchant_agreements")
      .select("id, version, body_sha256, signer_name, signer_role, business_legal_name, signed_at")
      .eq("merchant_id", merchantId)
      .order("signed_at", { ascending: false }),
  ]);
  const version = (current.data as AgreementVersion | null) ?? null;
  const all = (signatures.data ?? []) as AgreementSignature[];
  return { current: version, signature: version ? (all.find((s) => s.version === version.version) ?? null) : null, history: all };
}
