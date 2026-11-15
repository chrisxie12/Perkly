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

export type InstitutionOption = {
  id: string;
  name: string;
  short_name: string;
  institution_type: "public" | "private" | null;
  city: string | null;
  region: string | null;
  logo_path: string | null;
};
export type CampusOption = {
  id: string;
  institution_id: string;
  name: string;
  campus_type: "main" | "satellite" | "city" | "learning_centre";
  address: string | null;
  city: string | null;
  is_primary: boolean;
};

export async function getSchoolOptions(): Promise<{ institutions: InstitutionOption[]; campuses: CampusOption[] }> {
  const supabase = await createClient();
  const [institutions, campuses] = await Promise.all([
    supabase
      .from("institutions")
      .select("id, name, short_name, institution_type, city, region, logo_path")
      .in("status", ["pilot", "active"])
      .order("name"),
    supabase
      .from("campuses")
      .select("id, institution_id, name, campus_type, address, city, is_primary")
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("name"),
  ]);
  return { institutions: (institutions.data ?? []) as InstitutionOption[], campuses: (campuses.data ?? []) as CampusOption[] };
}
