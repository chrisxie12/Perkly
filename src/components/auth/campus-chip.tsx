import Link from "next/link";
import { MapPin } from "lucide-react";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getMyStudentStatus } from "@/features/students/queries";

/** "GCTU, Tesano": the school and campus deals are measured from. Links to School details. */
export async function CampusChip() {
  if (!hasSupabaseEnv()) return null;
  const status = await getMyStudentStatus();
  const school = status.profile?.institution_short_name;
  if (!school) {
    return (
      <Link
        href="/student/profile"
        aria-label="Choose your school"
        className="flex h-9 items-center gap-1 rounded-xl bg-blue-50 px-2.5 text-sm font-bold text-blue-600"
      >
        <MapPin className="size-4" aria-hidden /> School
      </Link>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_campus_location");
  const campus = (data as { name: string }[] | null)?.[0]?.name;
  return (
    <Link
      href="/student/profile"
      aria-label={`Your campus: ${school}${campus ? `, ${campus}` : ""}. Change in School details`}
      className="flex h-9 max-w-[11rem] min-w-fit items-center gap-1 rounded-xl bg-blue-50 px-2.5 text-sm font-bold text-blue-600 hover:bg-blue-100"
    >
      <MapPin className="hidden size-4 shrink-0 min-[380px]:block" aria-hidden />
      <span className="truncate whitespace-nowrap">
        {school}
        {/* Narrow phones: school only, so the logo keeps its name. */}
        {campus && <span className="hidden min-[420px]:inline">, {campus}</span>}
      </span>
    </Link>
  );
}
