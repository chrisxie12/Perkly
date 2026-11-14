import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { parseStudentStatus, type StudentStatus } from "./status";

export const getMyStudentStatus = cache(async (): Promise<StudentStatus> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_student_status");
  if (error) throw new Error(`Could not load verification status (${error.code ?? "unknown"})`);
  return parseStudentStatus(data);
});

export type InstitutionOption = { id: string; name: string; short_name: string };
export type CampusOption = { id: string; institution_id: string; name: string };

export async function getSchoolOptions(): Promise<{ institutions: InstitutionOption[]; campuses: CampusOption[] }> {
  const supabase = await createClient();
  const [institutions, campuses] = await Promise.all([
    supabase.from("institutions").select("id, name, short_name").in("status", ["pilot", "active"]).order("name"),
    supabase.from("campuses").select("id, institution_id, name").eq("is_active", true).order("name"),
  ]);
  return { institutions: (institutions.data ?? []) as InstitutionOption[], campuses: (campuses.data ?? []) as CampusOption[] };
}
