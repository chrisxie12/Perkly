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
      <Link href="/student/profile" className="flex h-9 items-center gap-1.5 rounded-xl bg-blue-50 px-3 text-sm font-bold text-blue-600">
        <MapPin className="size-4" aria-hidden /> Choose school
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
      className="flex h-9 max-w-[11rem] min-w-0 items-center gap-1.5 rounded-xl bg-blue-50 px-3 text-sm font-bold text-blue-600 hover:bg-blue-100"
    >
      <MapPin className="size-4 shrink-0" aria-hidden />
      <span className="truncate">
        {school}
        {campus ? `, ${campus}` : ""}
      </span>
    </Link>
  );
}
